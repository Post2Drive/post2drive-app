export const UK_COUNTRY_CODE = "GB";
export const UK_CURRENCY_CODE = "GBP";

export interface CountryCurrency {
  country?: string | null;
  currency?: string | null;
}

/**
 * UK-specific commercial features require BOTH:
 *
 * country = GB
 * currency = GBP
 */
export function isUkAccount(
  account: CountryCurrency
) {
  return (
    account.country === UK_COUNTRY_CODE &&
    account.currency === UK_CURRENCY_CODE
  );
}

export function requireUkAccount(
  account: CountryCurrency
) {
  if (!isUkAccount(account)) {
    throw new Error(
      "This feature is currently available only to United Kingdom accounts using GBP."
    );
  }
}

/**
 * Prevents an account from changing away from GB + GBP
 * after it has entered the UK promotional programme.
 */
export function isUkPromotionLocked(
  account: CountryCurrency & {
    promotionParticipant?: boolean;
    trialStartedAt?: Date | null;
  }
) {
  return Boolean(
    account.promotionParticipant ||
      account.trialStartedAt
  );
}