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
 * OWNER-APPROVED PRICE MATRIX (2026-11-06). Single source of truth: every page,
 * API and document must read these values, never hard-code them.
 * See docs/PRODUCT_AND_VERIFICATION_POLICY.md §6.
 *
 * Unified account, two levels:
 *  - Poster: person + company verified, no vehicle. Posts jobs only. Billed monthly.
 *  - Driver/Fleet: poster checks + verified vehicle(s). Takes jobs AND posts.
 *    Billed per 7-day period (7 x 24 hours from activation/renewal). The driver
 *    plan replaces the poster plan: one subscription per account, never both.
 * All plans: unlimited legitimate marketplace activity, no per-job charges,
 * no commission. Each supported non-India market uses the same numeric tiers
 * in its own local currency. India is free after phone OTP.
 * Checkout is not connected: these are published prices, not live billing.
 */
export const POSTER_MONTHLY_PRICE_GBP = 12.99;
export const POSTER_MONTHLY_PRICE_EUR = 12.99;

export const INDIVIDUAL_PRICE_GBP = 14.99;
export const INDIVIDUAL_PRICE_EUR = 14.99;
export const INDIVIDUAL_ACCESS_DAYS = 7;

/** India has free marketplace access after phone OTP verification. */
export const INDIA_MARKETPLACE_IS_FREE = true;

export const FLEET_PRICES_GBP = {
  "2-5": 24.99,
  "6-15": 39.99,
  "16-30": 59.99,
  "31-55": 79.99,
} as const;

export const FLEET_PRICES_EUR = {
  "2-5": 24.99,
  "6-15": 39.99,
  "16-30": 59.99,
  "31-55": 79.99,
} as const;

/** Fleets above this size need a custom plan. */
export const FLEET_MAX_STANDARD_VEHICLES = 55;

/*
 * One-off verification fees (non-India markets, same numbers in local currency).
 * Charged once per check package, separate from the subscription. Not refundable:
 * the fee pays for the check, not for passing it. Extra vehicles are always charged
 * and always collected in the same payment as other fees (never as a standalone
 * small card payment). See policy §3.
 */
export const VERIFICATION_FEES = {
  /** Step 2 for posters: person identity + company (or sole trader) checks. Driver-only users do not pay this; Step 3 includes their person check. */
  personAndCompany: 2.5,
  /** Step 3 for drivers/fleets: person/driver (reusing a valid person check) + driving licence + first vehicle (registration, MOT/inspection, insurance). */
  driverAndFirstVehicle: 3.5,
  /** Each additional vehicle, including vehicles added later on a paid plan. */
  additionalVehicle: 0.5,
} as const;

export type PublicPlan = {
  key: "poster" | "individual" | "fleet-2-5" | "fleet-6-15" | "fleet-16-30" | "fleet-31-55";
  name: string;
  detail: string;
  amount: number;
  period: "month" | "7 days";
};

/** Ordered list shown on the public pricing page and signup. */
export const PUBLIC_PLANS: readonly PublicPlan[] = [
  { key: "poster", name: "Poster", detail: "Post jobs only · no vehicle", amount: POSTER_MONTHLY_PRICE_GBP, period: "month" },
  { key: "individual", name: "Individual driver", detail: "1 verified person · 1 vehicle · posting included", amount: INDIVIDUAL_PRICE_GBP, period: "7 days" },
  { key: "fleet-2-5", name: "Fleet 2–5", detail: "2–5 company vehicles", amount: FLEET_PRICES_GBP["2-5"], period: "7 days" },
  { key: "fleet-6-15", name: "Fleet 6–15", detail: "6–15 company vehicles", amount: FLEET_PRICES_GBP["6-15"], period: "7 days" },
  { key: "fleet-16-30", name: "Fleet 16–30", detail: "16–30 company vehicles", amount: FLEET_PRICES_GBP["16-30"], period: "7 days" },
  { key: "fleet-31-55", name: "Fleet 31–55", detail: "31–55 company vehicles", amount: FLEET_PRICES_GBP["31-55"], period: "7 days" },
] as const;

/** Driver/fleet 7-day price for a signup choice, without needing an account record. */
export function weeklyPriceForVehicleCount(vehicleCount: number): number | null {
  if (!Number.isInteger(vehicleCount) || vehicleCount < 1) return null;
  if (vehicleCount === 1) return INDIVIDUAL_PRICE_GBP;
  if (vehicleCount <= 5) return FLEET_PRICES_GBP["2-5"];
  if (vehicleCount <= 15) return FLEET_PRICES_GBP["6-15"];
  if (vehicleCount <= 30) return FLEET_PRICES_GBP["16-30"];
  if (vehicleCount <= FLEET_MAX_STANDARD_VEHICLES) return FLEET_PRICES_GBP["31-55"];
  return null;
}

/** One-off verification total for a driver/fleet signing up with this many vehicles (Step 3 package + extra vehicles). */
export function driverVerificationTotal(vehicleCount: number): number | null {
  if (!Number.isInteger(vehicleCount) || vehicleCount < 1) return null;
  const cents = Math.round(VERIFICATION_FEES.driverAndFirstVehicle * 100)
    + (vehicleCount - 1) * Math.round(VERIFICATION_FEES.additionalVehicle * 100);
  return cents / 100;
}

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
