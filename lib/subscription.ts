import { prisma } from "@/lib/prisma";
import { majorUnitsToMinorUnits } from "@/lib/currencyMinorUnits";
import { getFleetPrice, getIndividualWeeklyPrice, INDIVIDUAL_ACCESS_DAYS, isWeeklyPricingEligible, POSTER_MONTHLY_PRICE_GBP } from "@/lib/pricing";
import { getEntitlementStatus } from "@/lib/access";
import { addMonths, creditMinorUnits } from "@/lib/launchWindows";

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * One subscription per account (EXECUTION_PLAN §2–§3): "poster" (monthly) until a vehicle is
 * approved and the switch date passes, then the driver/fleet 7-day plan, which replaces it.
 * Pass the billing plan from lib/launchWindows.computeBilling; without it the account plan type is used.
 */
export function getPaidPlanKey(account: {
  country?: string | null;
  currency?: string | null;
  planType?: "individual" | "fleet" | null;
}, billingPlan?: string | null) {
  if (!isWeeklyPricingEligible(account)) return null;
  if (billingPlan === "poster") return "poster";
  return account.planType === "fleet" ? "fleet" : "individual";
}

/** Return the price in minor currency units for the account currency. */
export function getPaidPriceMinorUnits(account: {
  country?: string | null;
  currency?: string | null;
  planType?: "individual" | "fleet" | null;
  fleetVehicleCount?: number | null;
}, billingPlan?: string | null) {
  if (!isWeeklyPricingEligible(account)) return null;

  const price = billingPlan === "poster"
    ? POSTER_MONTHLY_PRICE_GBP
    : account.planType === "fleet"
    ? getFleetPrice(account.fleetVehicleCount ?? 0, account)
    : getIndividualWeeklyPrice(account);

  if (price === null) return null;
  const currency = account.currency ?? "GBP";
  return majorUnitsToMinorUnits(price, currency);
}

/** Backwards-compatible alias. The integer is currency minor units, not always GBP pence. */
export const getPaidPricePence = getPaidPriceMinorUnits;

/** Driver/fleet plan: 7 x 24 hours, stacked on any remaining paid access. */
export function calculatePaidAccessEnd(startAt: Date) {
  return new Date(startAt.getTime() + INDIVIDUAL_ACCESS_DAYS * DAY_MS);
}

/** Poster plan: one calendar month, stacked on any remaining paid access. */
export function calculatePosterAccessEnd(startAt: Date) {
  return addMonths(startAt, 1);
}

export async function createPendingSubscriptionPayment(accountId: string) {
  // Billing starts on first chargeable use (EXECUTION_PLAN §3). The plan and the poster->driver
  // credit are computed from entitlements; the record stays "pending" (no provider is connected).
  const status = await getEntitlementStatus(accountId);
  const billing = status.billing;
  return prisma.$transaction(async tx => {
    // Serialize payment creation with account deletion and suspension changes.
    const lockedAccounts = await tx.$queryRawUnsafe<Array<{ id: string }>>(
      'SELECT "id" FROM "Account" WHERE "id" = $1 FOR UPDATE', accountId,
    );
    if (lockedAccounts.length !== 1) throw new Error("Account not found.");

    const account = await tx.account.findUnique({ where: { id: accountId } });
    if (!account) throw new Error("Account not found.");
    if (account.deletionRequestedAt) throw new Error("Account is pending deletion.");
    if (account.verificationStatus === "suspended") throw new Error("Account is suspended.");
    if (!isWeeklyPricingEligible(account)) {
      throw new Error("Paid weekly access is available to supported non-India markets.");
    }
    if (account.verificationStatus !== "verified" && !account.isTester) {
      throw new Error("Account must be successfully verified before purchasing access.");
    }

    if (!billing || billing.plan === "none" || !billing.chargeableFrom) {
      throw new Error("No payment is due yet. Billing starts with your first posted job or first approved vehicle, after any free launch period.");
    }
    const planKey = getPaidPlanKey(account, billing.plan);
    const fullAmount = getPaidPriceMinorUnits(account, billing.plan);
    if (!planKey || fullAmount === null) {
      throw new Error("This account does not have a valid weekly subscription price.");
    }
    // Unused poster-month days are credited to the FIRST 7-day payment only.
    let amountMinorUnits = fullAmount;
    if (planKey !== "poster" && billing.creditDays > 0) {
      const earlierDriverPayment = await tx.subscriptionPayment.findFirst({
        where: { accountId, planKey: { in: ["individual", "fleet"] } },
        select: { id: true },
      });
      if (!earlierDriverPayment) {
        const posterMinor = majorUnitsToMinorUnits(POSTER_MONTHLY_PRICE_GBP, account.currency ?? "GBP");
        amountMinorUnits = Math.max(0, fullAmount - creditMinorUnits(posterMinor, billing.creditDays, billing.creditPeriodDays));
      }
    }

    return tx.subscriptionPayment.create({
      data: {
        accountId,
        planKey,
        amountMinorUnits,
        currency: account.currency,
        status: "pending",
      },
    });
  });
}

export async function confirmSubscriptionPayment(
  paymentId: string,
  details?: {
    provider?: string;
    providerPaymentId?: string;
    providerCheckoutId?: string;
  }
) {
  return prisma.$transaction(async (tx) => {
    // Lock the payment row before reading it so simultaneous provider retries
    // observe the first callback result after it commits.
    const lockedPayments = await tx.$queryRawUnsafe<Array<{ id: string }>>(
      'SELECT "id" FROM "SubscriptionPayment" WHERE "id" = $1 FOR UPDATE', paymentId,
    );
    if (lockedPayments.length !== 1) throw new Error("Subscription payment not found.");

    const payment = await tx.subscriptionPayment.findUnique({ where: { id: paymentId } });
    if (!payment) throw new Error("Subscription payment not found.");
    if (payment.status === "paid") return payment;
    if (payment.status !== "pending") throw new Error("Subscription payment is not payable.");

    // Serialize different pending payments for one account as well. Otherwise
    // concurrent confirmations can overwrite access extensions calculated from stale state.
    const lockedAccounts = await tx.$queryRawUnsafe<Array<{ id: string }>>(
      'SELECT "id" FROM "Account" WHERE "id" = $1 FOR UPDATE', payment.accountId,
    );
    if (lockedAccounts.length !== 1) throw new Error("Account not found.");
    const account = await tx.account.findUnique({ where: { id: payment.accountId } });
    if (!account) throw new Error("Account not found.");
    if (account.deletionRequestedAt) throw new Error("Account is pending deletion.");
    if (account.verificationStatus === "suspended") throw new Error("Account is suspended.");
    if (payment.currency !== account.currency) {
      throw new Error("Payment currency does not match the account market.");
    }
    if (!isWeeklyPricingEligible(account)) {
      throw new Error("This account is not eligible for paid weekly access.");
    }

    const now = new Date();
    const currentEnd =
      account.subscriptionStatus === "active" &&
      account.subscriptionEndsAt &&
      account.subscriptionEndsAt > now
        ? account.subscriptionEndsAt
        : now;
    const accessEndsAt = payment.planKey === "poster" ? calculatePosterAccessEnd(currentEnd) : calculatePaidAccessEnd(currentEnd);

    await tx.account.update({
      where: { id: payment.accountId },
      data: {
        subscriptionStatus: "active",
        subscriptionPlanKey: payment.planKey,
        subscriptionStartedAt: now,
        subscriptionEndsAt: accessEndsAt,
        lastActivityAt: now,
        inactiveSince: null,
      },
    });

    return tx.subscriptionPayment.update({
      where: { id: paymentId },
      data: {
        status: "paid",
        paidAt: now,
        accessStartedAt: currentEnd,
        accessEndsAt,
        provider: details?.provider ?? null,
        providerPaymentId: details?.providerPaymentId ?? null,
        providerCheckoutId: details?.providerCheckoutId ?? null,
      },
    });
  });
}
