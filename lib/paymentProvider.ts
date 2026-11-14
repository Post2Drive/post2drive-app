import { getStripeConfig } from "./stripeProvider.ts";

/**
 * JOB money (what a poster pays a driver) is never processed, held, refunded
 * or paid out by Post2Drive: the payments screen is a declared tally only.
 * This flag covers that and stays false. It is not the subscription switch.
 */
export const PAYMENT_PROVIDER_CONNECTED = false;

export const NO_PROVIDER_NOTICE =
  "No payment provider is connected yet. Nothing has been charged, and no refund or payout is made through Post2Drive.";

export const CHECKOUT_NOTICE =
  "Nothing has been charged yet. You pay on the secure checkout page, and access starts only after the payment is confirmed.";

/**
 * SUBSCRIPTION checkout (Post2Drive's own plan fee). True only when the Stripe
 * API key and webhook signing secret are both configured; until then no
 * screen or API response may imply that a plan can be bought or was charged.
 */
export function subscriptionCheckoutConnected(env: Record<string, string | undefined> = process.env): boolean {
  return getStripeConfig(env) !== null;
}
