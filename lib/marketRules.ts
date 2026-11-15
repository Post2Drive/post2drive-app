import { MARKETS } from "./market.ts";

/**
 * Per-market behaviour. Add a market's differences here, not as country
 * checks in feature code. Any market not listed uses DEFAULT_RULES, which is
 * the UK-style flow (email and full verification, fixed-price jobs, paid
 * subscriptions, short region codes).
 */
export type MarketRules = {
  /** Sign in with a phone number and one-time text code. */
  phoneFirst: boolean;
  /** Email is asked for at signup and marks the email verified when present. */
  emailRequired: boolean;
  /** A company name is asked for unless the signup is a sole trader. */
  companyRequired: boolean;
  /** Paid subscription plans are offered. */
  subscriptionPricing: boolean;
  /** Verification and additional-vehicle fees are waived. */
  feeFree: boolean;
  /** Market research questions are collected at signup. */
  collectsMarketResearch: boolean;
  /** A job may be posted without a fixed price. */
  priceOptional: boolean;
  /** Jobs may be priced by open bidding. */
  biddingAllowed: boolean;
  /** The driver must add photos at pickup and delivery. */
  proofPhotosRequired: boolean;
  /** How an operating region is written. "none" means regions are not used. */
  regionFormat: "none" | "uk-postcode-area" | "short-code";
};

const DEFAULT_RULES: MarketRules = {
  phoneFirst: false,
  emailRequired: true,
  companyRequired: true,
  subscriptionPricing: true,
  feeFree: false,
  collectsMarketResearch: false,
  priceOptional: false,
  biddingAllowed: true,
  proofPhotosRequired: true,
  regionFormat: "short-code",
};

const MARKET_RULES: Partial<Record<string, MarketRules>> = {
  GB: { ...DEFAULT_RULES, regionFormat: "uk-postcode-area" },
  IN: {
    phoneFirst: true,
    emailRequired: false,
    companyRequired: false,
    subscriptionPricing: false,
    feeFree: true,
    collectsMarketResearch: true,
    priceOptional: true,
    biddingAllowed: false,
    proofPhotosRequired: false,
    regionFormat: "none",
  },
};

/** Rules for a country code, regardless of currency. */
export function rulesForCountry(country: unknown): MarketRules {
  return (typeof country === "string" && MARKET_RULES[country]) || DEFAULT_RULES;
}

/** Rules for an account only when its currency matches the market (the usual case). */
export function rulesForAccount(account: { country?: string | null; currency?: string | null }): MarketRules {
  const country = account.country;
  if (typeof country !== "string") return DEFAULT_RULES;
  const market = (MARKETS as Record<string, { currency: string }>)[country];
  if (!market || market.currency !== account.currency) return DEFAULT_RULES;
  return rulesForCountry(country);
}
