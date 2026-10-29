import { createHash, randomInt, randomBytes, timingSafeEqual } from "node:crypto";

export const OTP_TTL_MS = 5 * 60 * 1000;
export const OTP_RESEND_COOLDOWN_MS = 60 * 1000;
export const OTP_MAX_ATTEMPTS = 5;

export type OtpChallenge = {
  phoneHash: string;
  codeHash: string;
  expiresAt: number;
  createdAt: number;
  attempts: number;
  consumedAt: number | null;
};

export type OtpIssueResult =
  | { ok: true; challenge: OtpChallenge; codeForDelivery: string }
  | { ok: false; reason: "cooldown" | "provider_unconfigured" };

export interface OtpChallengeStore {
  get(phoneHash: string): Promise<OtpChallenge | null>;
  put(challenge: OtpChallenge): Promise<void>;
  consume(phoneHash: string, expectedCodeHash: string, now: number): Promise<boolean>;
}

/** Hash phone identifiers before storing/rate-limiting them. */
export function hashPhoneIdentifier(phoneE164: string): string {
  return createHash("sha256").update(phoneE164).digest("hex");
}

function hashOtp(code: string, pepper: string): string {
  return createHash("sha256").update(pepper).update(":").update(code).digest("hex");
}

export async function issueOtp(
  phoneE164: string,
  store: OtpChallengeStore,
  options: { now?: number; pepper: string; providerConfigured: boolean; generateCode?: () => string } ,
): Promise<OtpIssueResult> {
  if (!options.providerConfigured) return { ok: false, reason: "provider_unconfigured" };
  if (!options.pepper) throw new Error("OTP hashing secret is not configured.");
  const now = options.now ?? Date.now();
  const phoneHash = hashPhoneIdentifier(phoneE164);
  const existing = await store.get(phoneHash);
  if (existing && now - existing.createdAt < OTP_RESEND_COOLDOWN_MS) {
    return { ok: false, reason: "cooldown" };
  }
  const code = options.generateCode?.() ?? String(randomInt(0, 1_000_000)).padStart(6, "0");
  if (!/^\d{6}$/.test(code)) throw new Error("OTP generator must return six digits.");
  const challenge: OtpChallenge = {
    phoneHash,
    codeHash: hashOtp(code, options.pepper),
    expiresAt: now + OTP_TTL_MS,
    createdAt: now,
    attempts: 0,
    consumedAt: null,
  };
  await store.put(challenge);
  return { ok: true, challenge, codeForDelivery: code };
}

/**
 * Atomic consumption must be implemented by the persistent store using a
 * conditional update/transaction. This wrapper never returns true on expiry,
 * replay, or hash mismatch.
 */
export async function verifyOtp(
  phoneE164: string,
  suppliedCode: string,
  store: OtpChallengeStore,
  options: { now?: number; pepper: string },
): Promise<boolean> {
  const now = options.now ?? Date.now();
  const phoneHash = hashPhoneIdentifier(phoneE164);
  const challenge = await store.get(phoneHash);
  if (!challenge || challenge.consumedAt !== null || challenge.expiresAt <= now ||
      challenge.attempts >= OTP_MAX_ATTEMPTS || !/^\d{6}$/.test(suppliedCode)) return false;

  const suppliedHash = hashOtp(suppliedCode, options.pepper);
  const a = Buffer.from(challenge.codeHash, "hex");
  const b = Buffer.from(suppliedHash, "hex");
  const match = a.length === b.length && timingSafeEqual(a, b);
  if (!match) {
    await store.put({ ...challenge, attempts: challenge.attempts + 1 });
    return false;
  }
  return store.consume(phoneHash, challenge.codeHash, now);
}

/** Test-only memory store. Never use this for production verification state. */
export class InMemoryOtpStore implements OtpChallengeStore {
  private readonly records = new Map<string, OtpChallenge>();
  async get(phoneHash: string) {
    const record = this.records.get(phoneHash);
    return record ? { ...record } : null;
  }
  async put(challenge: OtpChallenge) {
    this.records.set(challenge.phoneHash, { ...challenge });
  }
  async consume(phoneHash: string, expectedCodeHash: string, now: number) {
    const current = this.records.get(phoneHash);
    if (!current || current.consumedAt !== null || current.expiresAt <= now ||
        current.attempts >= OTP_MAX_ATTEMPTS || current.codeHash !== expectedCodeHash) return false;
    this.records.set(phoneHash, { ...current, consumedAt: now });
    return true;
  }
}

/** Minimal durable-store contract for idempotent payment event application. */
export interface PaymentEventStore {
  hasProcessed(provider: string, eventId: string): Promise<boolean>;
  applyOnce(input: {
    provider: string;
    eventId: string;
    paymentId: string;
    expectedAmountMinorUnits: number;
    expectedCurrency: string;
    receivedAmountMinorUnits: number;
    receivedCurrency: string;
    verified: boolean;
    transition: "paid" | "failed" | "refunded";
  }): Promise<"applied" | "duplicate" | "rejected">;
}

export async function applyVerifiedPaymentEvent(
  store: PaymentEventStore,
  input: Parameters<PaymentEventStore["applyOnce"]>[0],
): Promise<"applied" | "duplicate" | "rejected"> {
  if (!input.verified || !input.provider || !input.eventId || !input.paymentId) return "rejected";
  if (!Number.isSafeInteger(input.expectedAmountMinorUnits) ||
      !Number.isSafeInteger(input.receivedAmountMinorUnits) ||
      input.expectedAmountMinorUnits < 0 ||
      input.receivedAmountMinorUnits !== input.expectedAmountMinorUnits ||
      input.expectedCurrency.toUpperCase() !== input.receivedCurrency.toUpperCase()) return "rejected";
  if (await store.hasProcessed(input.provider, input.eventId)) return "duplicate";
  return store.applyOnce(input);
}

/** Generates opaque idempotency keys; never use user-supplied keys as auth. */
export function newIdempotencyKey(): string {
  return randomBytes(24).toString("hex");
}
