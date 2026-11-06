/*
 * Driving licence identity (EXECUTION_PLAN §6): one verified person can be a driver on
 * only one account. Server only. The plain licence number is never stored or logged;
 * we keep an HMAC-SHA256 keyed hash (unique across accounts) and the last 4 characters.
 */
import { createHmac } from "node:crypto";

/**
 * Keyed-hash secret. Production must set POST2DRIVE_LICENCE_HASH_SECRET (no fallback,
 * so rotating the auth secret can never silently break licence uniqueness); other
 * environments may fall back to NEXTAUTH_SECRET like the OTP pepper. Null = fail closed.
 */
export function licenceHashSecret(env: Record<string, string | undefined> = process.env) {
  const dedicated = env.POST2DRIVE_LICENCE_HASH_SECRET || "";
  const secret = env.NODE_ENV === "production" ? dedicated : dedicated || env.NEXTAUTH_SECRET || "";
  return secret.length >= 32 ? secret : null;
}

export function hashLicenceNumber(normalised: string, secret: string) {
  return createHmac("sha256", secret).update("post2drive-driving-licence-v1:" + normalised).digest("hex");
}

export function licenceLast4(normalised: string) {
  return normalised.slice(-4);
}

/** Same response for "already used elsewhere" and any storage failure: no account enumeration. */
export const LICENCE_NOT_ACCEPTED_MESSAGE =
  "We could not record this driving licence. Check the number, or contact support if you think it is correct.";

