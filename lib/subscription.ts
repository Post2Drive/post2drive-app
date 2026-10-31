import { prisma } from "@/lib/prisma";
import { majorUnitsToMinorUnits } from "@/lib/currencyMinorUnits";
import { getFleetPrice, getIndividualWeeklyPrice, INDIVIDUAL_ACCESS_DAYS, isWeeklyPricingEligible } from "@/lib/pricing";

const DAY_MS = 24 * 60 * 60 * 1000;

export function getPaidPlanKey(account: {
  country?: string | null;
  currency?: string | null;
  planType?: "individual" | "fleet" | null;
}) {
  if (!isWeeklyPricingEligible(account)) return null;
  return account.planType === "fleet" ? "fleet" : "individual";
}

/** Return the price in minor currency units for the account currency. */
export function getPaidPriceMinorUnits(account: {
  country?: string | null;
  currency?: string | null;
  planType?: "individual" | "fleet" | null;
  fleetVehicleCount?: number | null;
}) {
  if (!isWeeklyPricingEligible(account)) return null;

  const price = account.planType === "fleet"
    ? getFleetPrice(account.fleetVehicleCount ?? 0, account)
    : getIndividualWeeklyPrice(account);

  if (price === null) return null;
  const currency = account.currency ?? "GBP";
  return majorUnitsToMinorUnits(price, currency);
}

/** Backwards-compatible alias. The integer is currency minor units, not always GBP pence. */
export const getPaidPricePence = getPaidPriceMinorUnits;

export function calculatePaidAccessEnd(startAt: Date) {
  return new Date(startAt.getTime() + INDIVIDUAL_ACCESS_DAYS * DAY_MS);
}

export async function createPendingSubscriptionPayment(accountId: string) {
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

    const planKey = getPaidPlanKey(account);
    const amountMinorUnits = getPaidPriceMinorUnits(account);
    if (!planKey || amountMinorUnits === null) {
      throw new Error("This account does not have a valid weekly subscription price.");
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
    const accessEndsAt = calculatePaidAccessEnd(currentEnd);

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
