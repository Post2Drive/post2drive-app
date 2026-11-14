import { createHmac, timingSafeEqual } from "node:crypto";
import { fetchWithRetry, type FetchLike } from "./httpRetry.ts";

/**
 * Stripe Checkout adapter (one-off payment per access period; Post2Drive
 * decides plan, amount and currency). Card data never touches Post2Drive:
 * the customer pays on Stripe's hosted page.
 *
 * A payment is marked paid ONLY from a signature-verified webhook event,
 * never from the browser returning to the success URL.
 */
type Env = Record<string, string | undefined>;
const value = (env: Env, key: string) => env[key]?.trim() || "";

export const STRIPE_PROVIDER_ID = "stripe";
export const STRIPE_SIGNATURE_TOLERANCE_SECONDS = 300;
export const STRIPE_MAX_WEBHOOK_BYTES = 256 * 1024;

export interface StripeConfig {
  secretKey: string;
  webhookSecret: string;
  liveMode: boolean;
}

/** Null unless both the API key and the webhook signing secret are set and well-formed. */
export function getStripeConfig(env: Env = process.env): StripeConfig | null {
  const secretKey = value(env, "STRIPE_SECRET_KEY");
  const webhookSecret = value(env, "STRIPE_WEBHOOK_SECRET");
  if (!/^(sk|rk)_(test|live)_[A-Za-z0-9]{16,}$/.test(secretKey) || !/^whsec_[A-Za-z0-9+/=]{16,}$/.test(webhookSecret)) return null;
  return { secretKey, webhookSecret, liveMode: /^(sk|rk)_live_/.test(secretKey) };
}

export interface StripeCheckoutRequest {
  paymentId: string;
  accountId: string;
  planKey: string;
  productName: string;
  amountMinorUnits: number;
  currency: string;
  idempotencyKey: string;
  successUrl: string;
  cancelUrl: string;
  customerEmail?: string | null;
}

export type StripeCheckoutResult =
  | { ok: true; providerCheckoutId: string; redirectUrl: string; expiresAt: Date | null }
  | { ok: false; reason: "temporarily_unavailable" | "rejected" };

export async function createStripeCheckout(
  config: StripeConfig,
  request: StripeCheckoutRequest,
  fetchImpl?: FetchLike,
): Promise<StripeCheckoutResult> {
  if (!Number.isSafeInteger(request.amountMinorUnits) || request.amountMinorUnits <= 0) return { ok: false, reason: "rejected" };
  const form = new URLSearchParams({
    mode: "payment",
    success_url: request.successUrl,
    cancel_url: request.cancelUrl,
    client_reference_id: request.paymentId,
    "line_items[0][quantity]": "1",
    "line_items[0][price_data][currency]": request.currency.toLowerCase(),
    "line_items[0][price_data][unit_amount]": String(request.amountMinorUnits),
    "line_items[0][price_data][product_data][name]": request.productName,
    "metadata[paymentId]": request.paymentId,
    "metadata[accountId]": request.accountId,
    "metadata[planKey]": request.planKey,
    "payment_intent_data[metadata][paymentId]": request.paymentId,
    "payment_intent_data[metadata][accountId]": request.accountId,
  });
  if (request.customerEmail) form.set("customer_email", request.customerEmail);

  let response: Response;
  try {
    response = await fetchWithRetry(
      "https://api.stripe.com/v1/checkout/sessions",
      {
        method: "POST",
        headers: {
          Authorization: `Bearer ${config.secretKey}`,
          "Content-Type": "application/x-www-form-urlencoded",
          // Same key on every retry and every repeat click: Stripe returns the same session.
          "Idempotency-Key": request.idempotencyKey,
        },
        body: form.toString(),
      },
      { retries: 2, retryOn: [409, 429, 500, 502, 503, 504], ...(fetchImpl ? { fetchImpl } : {}) },
    );
  } catch {
    return { ok: false, reason: "temporarily_unavailable" };
  }
  if (!response.ok) {
    console.error("Payment provider rejected checkout creation.", { provider: STRIPE_PROVIDER_ID, status: response.status });
    return { ok: false, reason: response.status >= 500 || response.status === 429 ? "temporarily_unavailable" : "rejected" };
  }
  try {
    const session = await response.json() as { id?: unknown; url?: unknown; expires_at?: unknown };
    if (typeof session.id !== "string" || typeof session.url !== "string" || !session.url.startsWith("https://")) {
      return { ok: false, reason: "temporarily_unavailable" };
    }
    return {
      ok: true,
      providerCheckoutId: session.id,
      redirectUrl: session.url,
      expiresAt: typeof session.expires_at === "number" ? new Date(session.expires_at * 1000) : null,
    };
  } catch {
    return { ok: false, reason: "temporarily_unavailable" };
  }
}

/** Constant-time check of `Stripe-Signature` (t=<unix>,v1=<hex>) over `${t}.${rawBody}`. */
export function verifyStripeSignature(
  rawBody: string,
  signatureHeader: string | null,
  webhookSecret: string,
  nowSeconds: number = Math.floor(Date.now() / 1000),
): boolean {
  if (!signatureHeader || !webhookSecret || signatureHeader.length > 1024) return false;
  let timestamp = "";
  const candidates: string[] = [];
  for (const part of signatureHeader.split(",")) {
    const index = part.indexOf("=");
    if (index < 1) continue;
    const key = part.slice(0, index).trim();
    const val = part.slice(index + 1).trim();
    if (key === "t") timestamp = val;
    else if (key === "v1") candidates.push(val);
  }
  if (!/^\d{1,12}$/.test(timestamp) || candidates.length === 0) return false;
  if (Math.abs(nowSeconds - Number(timestamp)) > STRIPE_SIGNATURE_TOLERANCE_SECONDS) return false;

  const expected = createHmac("sha256", webhookSecret).update(`${timestamp}.${rawBody}`, "utf8").digest();
  return candidates.some((candidate) => {
    if (!/^[0-9a-f]{64}$/i.test(candidate)) return false;
    return timingSafeEqual(expected, Buffer.from(candidate, "hex"));
  });
}

export type StripePaymentEvent =
  | { kind: "paid"; eventId: string; paymentId: string; accountId: string | null; amountMinorUnits: number; currency: string; providerPaymentId: string; providerCheckoutId: string; liveMode: boolean }
  | { kind: "expired" | "failed"; eventId: string; paymentId: string; providerCheckoutId: string | null; liveMode: boolean }
  | { kind: "refunded"; eventId: string; providerPaymentId: string; amountRefundedMinorUnits: number; fullyRefunded: boolean; currency: string; liveMode: boolean }
  | { kind: "ignored"; eventId: string; type: string; liveMode: boolean };

const text = (v: unknown, max = 255): string | null => (typeof v === "string" && v.length > 0 && v.length <= max ? v : null);
const amount = (v: unknown): number | null => (typeof v === "number" && Number.isSafeInteger(v) && v >= 0 ? v : null);

/**
 * Verify, then map a Stripe event to the few transitions Post2Drive acts on.
 * Returns null for a bad signature or malformed envelope. Anything verified
 * but not relevant comes back as kind "ignored" so it can be acknowledged.
 */
export function parseStripeWebhook(
  rawBody: string,
  signatureHeader: string | null,
  config: StripeConfig,
  nowSeconds?: number,
): StripePaymentEvent | null {
  if (!verifyStripeSignature(rawBody, signatureHeader, config.webhookSecret, nowSeconds)) return null;
  let event: { id?: unknown; type?: unknown; livemode?: unknown; data?: { object?: Record<string, unknown> } };
  try { event = JSON.parse(rawBody); } catch { return null; }
  const eventId = text(event.id);
  const type = text(event.type, 100);
  const object = event.data?.object;
  if (!eventId || !type || !object || typeof object !== "object") return null;
  const liveMode = event.livemode === true;
  const metadata = (object.metadata && typeof object.metadata === "object" ? object.metadata : {}) as Record<string, unknown>;
  const ignored: StripePaymentEvent = { kind: "ignored", eventId, type, liveMode };

  if (type === "checkout.session.completed" || type === "checkout.session.async_payment_succeeded") {
    const paymentId = text(metadata.paymentId) ?? text(object.client_reference_id);
    const total = amount(object.amount_total);
    const currency = text(object.currency, 8);
    const providerPaymentId = text(object.payment_intent);
    const providerCheckoutId = text(object.id);
    // "completed" with a delayed method is not money yet; wait for async_payment_succeeded.
    if (object.payment_status !== "paid") return ignored;
    if (!paymentId || total === null || !currency || !providerPaymentId || !providerCheckoutId) return null;
    return { kind: "paid", eventId, paymentId, accountId: text(metadata.accountId), amountMinorUnits: total, currency: currency.toUpperCase(), providerPaymentId, providerCheckoutId, liveMode };
  }
  if (type === "checkout.session.expired" || type === "checkout.session.async_payment_failed") {
    const paymentId = text(metadata.paymentId) ?? text(object.client_reference_id);
    if (!paymentId) return ignored;
    return { kind: type === "checkout.session.expired" ? "expired" : "failed", eventId, paymentId, providerCheckoutId: text(object.id), liveMode };
  }
  if (type === "charge.refunded") {
    const providerPaymentId = text(object.payment_intent);
    const refunded = amount(object.amount_refunded);
    const currency = text(object.currency, 8);
    if (!providerPaymentId || refunded === null || !currency) return ignored;
    return { kind: "refunded", eventId, providerPaymentId, amountRefundedMinorUnits: refunded, fullyRefunded: object.refunded === true, currency: currency.toUpperCase(), liveMode };
  }
  return ignored;
}

/** Test helper and the format Stripe itself uses; exported for contract tests only. */
export function signStripePayload(rawBody: string, webhookSecret: string, timestampSeconds: number): string {
  const v1 = createHmac("sha256", webhookSecret).update(`${timestampSeconds}.${rawBody}`, "utf8").digest("hex");
  return `t=${timestampSeconds},v1=${v1}`;
}
