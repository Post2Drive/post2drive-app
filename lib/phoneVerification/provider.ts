/**
 * Provider-neutral phone verification contracts.
 *
 * This module intentionally contains no vendor SDK or network calls. Provider
 * credentials and the actual UK provider must be selected before delivery can
 * be enabled. Do not use this module to infer marketplace eligibility.
 */

export type PhoneCountry = "GB" | "IN";

export type PhoneRoute = {
  country: PhoneCountry;
  callingCode: "+44" | "+91";
  providerEnv: "POST2DRIVE_SMS_PROVIDER_GB" | "POST2DRIVE_SMS_PROVIDER_IN";
  providerName: string | null;
  ready: boolean;
};

export type PhoneVerificationProvider = {
  /** Send a short-lived verification challenge. Never log the code or phone. */
  sendCode(input: { phoneE164: string; challengeId: string }): Promise<void>;
  /** Verify a submitted code against the provider's challenge. */
  verifyCode(input: { phoneE164: string; challengeId: string; code: string }): Promise<boolean>;
};

const PHONE_ROUTE_CONFIG = {
  GB: { callingCode: "+44", providerEnv: "POST2DRIVE_SMS_PROVIDER_GB" },
  IN: { callingCode: "+91", providerEnv: "POST2DRIVE_SMS_PROVIDER_IN" },
} as const;

/** Accepts only an already-normalized E.164 number. */
export function isE164PhoneNumber(phone: unknown): phone is string {
  return typeof phone === "string" && /^\+[1-9]\d{7,14}$/.test(phone);
}

/**
 * Route by the phone number's calling code, never IP address or marketplace.
 * Unknown calling codes fail closed. A GB marketplace account may therefore
 * use a +91 phone while testing from India without becoming an India-market
 * account.
 */
export function resolvePhoneRoute(phone: unknown): PhoneRoute | null {
  if (!isE164PhoneNumber(phone)) return null;

  const country: PhoneCountry | null = phone.startsWith("+44")
    ? "GB"
    : phone.startsWith("+91")
      ? "IN"
      : null;
  if (!country) return null;

  const config = PHONE_ROUTE_CONFIG[country];
  const providerName = process.env[config.providerEnv]?.trim().toLowerCase() || null;

  return {
    country,
    callingCode: config.callingCode,
    providerEnv: config.providerEnv,
    providerName,
    // A configured name alone cannot activate delivery; a server adapter
    // must also be registered before any message can be sent.
    ready: false,
  };
}

/** Conservative validation for a provider identifier (not a credential). */
export function isSupportedPhoneProviderName(value: unknown): value is string {
  return typeof value === "string" && /^[a-z][a-z0-9-]{1,31}$/.test(value);
}
