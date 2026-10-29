import { isQaRunnerEnabled } from "@/lib/qaRunnerGuard";

/**
 * Provider-independent phone/SMS routing.
 *
 * Marketplace selection (for example GB + GBP) is separate from the country
 * calling code of the phone number. An Indian student can test the UK market
 * using a real +91 number.
 *
 * This module does not send SMS. A provider adapter must be integrated and
 * tested before a route can be marked ready.
 */
export type PhoneCountry = "GB" | "IN";
export type SmsProviderSlot = "uk" | "india";

export type PhoneRouteResult =
  | {
      supported: true;
      country: PhoneCountry;
      providerSlot: SmsProviderSlot;
      providerName: string | null;
      ready: boolean;
      reason: "provider-selection-required" | "provider-adapter-not-integrated";
    }
  | {
      supported: false;
      country: null;
      providerSlot: null;
      providerName: null;
      ready: false;
      reason: "invalid-e164" | "unsupported-country";
    };

const E164_PATTERN = /^\+[1-9]\d{7,14}$/;

export function normalizeE164Phone(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const phone = value.trim();
  return E164_PATTERN.test(phone) ? phone : null;
}

/** Route by calling code only; never infer it from IP or marketplace country. */
export function resolvePhoneRoute(value: unknown): PhoneRouteResult {
  const phone = normalizeE164Phone(value);
  if (!phone) return { supported: false, country: null, providerSlot: null, providerName: null, ready: false, reason: "invalid-e164" };

  let country: PhoneCountry;
  let providerSlot: SmsProviderSlot;
  let providerName: string | null;

  if (phone.startsWith("+44")) {
    country = "GB";
    providerSlot = "uk";
    providerName = process.env.POST2DRIVE_SMS_UK_PROVIDER?.trim() || null;
  } else if (phone.startsWith("+91")) {
    country = "IN";
    providerSlot = "india";
    providerName = process.env.POST2DRIVE_SMS_INDIA_PROVIDER?.trim() || null;
  } else {
    return { supported: false, country: null, providerSlot: null, providerName: null, ready: false, reason: "unsupported-country" };
  }

  // Provider selection alone is insufficient: an adapter must also be coded,
  // registered, and tested. No SMS adapter is integrated in this module.
  return {
    supported: true, country, providerSlot, providerName, ready: false,
    reason: providerName ? "provider-adapter-not-integrated" : "provider-selection-required",
  };
}

/** Test mode requires both explicit opt-in and the isolated staging QA guard. */
export function isStagingTestPhoneVerificationEnabled(): boolean {
  return process.env.POST2DRIVE_STAGING_TEST_PHONE_VERIFICATION === "true" && isQaRunnerEnabled();
}
