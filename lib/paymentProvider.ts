/**
 * No payment provider is connected (tracked in #124). While this is false, no
 * API response or screen may imply that money was charged, refunded or paid out.
 * Flip only together with a real provider integration and its webhook binding.
 */
export const PAYMENT_PROVIDER_CONNECTED = false;

export const NO_PROVIDER_NOTICE =
  "No payment provider is connected yet. Nothing has been charged, and no refund or payout is made through Post2Drive.";
