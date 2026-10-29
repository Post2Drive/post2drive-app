import { isUkAccount } from "@/lib/uk";
import { isWeeklyPricingMarket, marketForAccount, MARKETS } from "@/lib/market";

export type PricingPlan = "individual" | "fleet";

export interface PricingAccount {
  country?: string | null;
  currency?: string | null;
  planType?: PricingPlan | null;
  fleetVehicleCount?: number | null;
}

/*
 * UK-model launch pricing for all supported non-India markets.
 * Access is sold in 7-day periods (7 x 24 hours from activation/recharge).
 * Individual = one verified person + one vehicle.
 * Fleet = 2+ vehicles under the same business/account.
 * All plans: unlimited legitimate marketplace activity and no per-job charges.
 * Each supported non-India market uses the same numeric tiers in its own local currency.
 */
export const INDIVIDUAL_PRICE_GBP = 9.99;
export const INDIVIDUAL_PRICE_EUR = 9.99;
export const INDIVIDUAL_ACCESS_DAYS = 7;

/** India has free marketplace access after phone OTP verification. */
export const INDIA_MARKETPLACE_IS_FREE = true;

export const FLEET_PRICES_GBP = {
  "2-5": 16.99,
  "6-15": 24.99,
  "16-30": 36.99,
  "31-55": 49.99,
} as const;

export const FLEET_PRICES_EUR = {
  "2-5": 16.99,
  "6-15": 24.99,
  "16-30": 36.99,
  "31-55": 49.99,
} as const;

export function isUkPricingEligible(account: PricingAccount) {
  return isUkAccount({ country: account.country, currency: account.currency });
}

export function isWeeklyPricingEligible(account: PricingAccount) {
  return isWeeklyPricingMarket({ country: account.country, currency: account.currency });
}

function pricesFor(account?: PricingAccount) {
  if (account && !isWeeklyPricingEligible(account)) return null;
  const market = account ? marketForAccount(account) : MARKETS.GB;
  if (!market || market.country === "IN") return null;
  return {
    currency: market.currency,
    symbol: market.symbol,
    format: (amount: number) => new Intl.NumberFormat(market.locale, {
      style: "currency", currency: market.currency,
    }).format(amount),
    individual: INDIVIDUAL_PRICE_GBP,
    fleet: FLEET_PRICES_GBP,
  };
}

export function getIndividualWeeklyPrice(account?: PricingAccount) {
  return pricesFor(account)?.individual ?? null;
}

export function calculateIndividualWeeklyPrice(account?: PricingAccount) {
  return getIndividualWeeklyPrice(account);
}

/** Kept for compatibility with existing callers; pricing is a flat 7-day fee. */
export function calculateIndividualMonthlyPrice(_acceptedJobs: number, account?: PricingAccount) {
  return getIndividualWeeklyPrice(account);
}

export function getFleetPrice(vehicleCount: number, account?: PricingAccount) {
  const prices = pricesFor(account);
  if (!prices || vehicleCount < 2 || vehicleCount > 55) return null;
  if (vehicleCount <= 5) return prices.fleet["2-5"];
  if (vehicleCount <= 15) return prices.fleet["6-15"];
  if (vehicleCount <= 30) return prices.fleet["16-30"];
  return prices.fleet["31-55"];
}

export function getPlanDisplay(
  planKey: PricingPlan | null,
  account?: PricingAccount,
) {
  if (account?.country === "IN" && account?.currency === "INR") {
    return {
      key: planKey,
      name: "India Free",
      price: 0,
      currency: "INR",
      description: "Free marketplace access after phone OTP verification. No person or company verification fee.",
    };
  }
  const prices = pricesFor(account);
  if (!prices) {
    return {
      key: planKey,
      name: "Local plan",
      price: null,
      currency: account?.currency ?? null,
      description: "Pricing for this country will be configured separately.",
    };
  }

  if (planKey === "fleet") {
    const price = getFleetPrice(account?.fleetVehicleCount ?? 0, account);
    return {
      key: "fleet",
      name: "Fleet",
      price,
      currency: prices.currency,
      description: price === null
        ? "Fleets with 56+ vehicles need a custom plan."
        : `${prices.format(price)} for 7-day access, based on fleet size. Unlimited legitimate marketplace activity; no per-job charges.`,
    };
  }

  return {
    key: "individual",
    name: "Individual",
    price: prices.individual,
    currency: prices.currency,
    description: `${prices.format(prices.individual)} for 7 days of access. One verified person and one vehicle. Unlimited legitimate marketplace activity with no per-job charges.`,
  };
}
