import { isUkAccount } from "@/lib/uk";

export type PricingPlan =
  | "individual"
  | "fleet";

export interface PricingAccount {
  country?: string | null;
  currency?: string | null;
  planType?: PricingPlan | null;
}

/*
 * UK launch pricing
 *
 * Access is sold in 7-day periods.
 * One access period = 7 x 24 hours from activation/recharge.
 *
 * Individual:
 *   1 verified person + 1 vehicle
 *
 * Fleet:
 *   2+ vehicles under the same business/account
 *
 * All plans:
 *   Unlimited legitimate marketplace activity
 *   No per-job charges
 */

export const INDIVIDUAL_PRICE_GBP = 9.99;
export const INDIVIDUAL_ACCESS_DAYS = 7;

export const FLEET_PRICES_GBP = {
  "2-5": 16.99,
  "6-15": 24.99,
  "16-30": 36.99,
  "31-55": 49.99,
} as const;

export function isUkPricingEligible(
  account: PricingAccount
) {
  return isUkAccount({
    country: account.country,
    currency: account.currency,
  });
}

export function calculateIndividualWeeklyPrice(
  account?: PricingAccount
) {
  if (
    account &&
    !isUkPricingEligible(account)
  ) {
    return null;
  }

  return INDIVIDUAL_PRICE_GBP;
}

/*
 * Kept for compatibility with existing callers.
 * Individual pricing is no longer based on accepted-job volume.
 */
export function calculateIndividualMonthlyPrice(
  _acceptedJobs: number,
  account?: PricingAccount
) {
  if (
    account &&
    !isUkPricingEligible(account)
  ) {
    return null;
  }

  return INDIVIDUAL_PRICE_GBP;
}

export function getFleetPrice(
  vehicleCount: number,
  account?: PricingAccount
) {
  if (
    account &&
    !isUkPricingEligible(account)
  ) {
    return null;
  }

  /*
   * A single vehicle belongs on the Individual plan.
   * Fleet starts at 2 vehicles.
   */
  if (vehicleCount < 2) {
    return null;
  }

  if (vehicleCount <= 5) {
    return FLEET_PRICES_GBP["2-5"];
  }

  if (vehicleCount <= 15) {
    return FLEET_PRICES_GBP["6-15"];
  }

  if (vehicleCount <= 30) {
    return FLEET_PRICES_GBP["16-30"];
  }

  if (vehicleCount <= 55) {
    return FLEET_PRICES_GBP["31-55"];
  }

  return null;
}

export function getPlanDisplay(
  planKey:
    | "individual"
    | "fleet"
    | null,
  account?: PricingAccount
) {
  if (
    account &&
    !isUkPricingEligible(account)
  ) {
    return {
      key: planKey,
      name: "Local plan",
      price: null,
      currency:
        account.currency || null,
      description:
        "Pricing for this country will be configured separately.",
    };
  }

  if (planKey === "fleet") {
    return {
      key: "fleet",
      name: "Fleet",
      price: null,
      currency: "GBP",
      description:
        "UK fleet pricing is based on the number of vehicles and provides 7-day access with unlimited legitimate marketplace activity.",
    };
  }

  return {
    key: "individual",
    name: "Individual",
    price: INDIVIDUAL_PRICE_GBP,
    currency: "GBP",
    description:
      "£9.99 for 7 days of access. One verified person and one vehicle. Unlimited legitimate marketplace activity with no per-job charges.",
  };
}