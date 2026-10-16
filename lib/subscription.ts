import { prisma } from "@/lib/prisma";
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
  const fractionDigits = new Intl.NumberFormat("en", {
    style: "currency", currency,
  }).resolvedOptions().maximumFractionDigits;
  return Math.round(price * (10 ** fractionDigits));
}

/** Backwards-compatible alias. The integer is currency minor units, not always GBP pence. */
export const getPaidPricePence = getPaidPriceMinorUnits;

export function calculatePaidAccessEnd(startAt: Date) {
  return new Date(startAt.getTime() + INDIVIDUAL_ACCESS_DAYS * DAY_MS);
}

export async function createPendingSubscriptionPayment(accountId: string) {
  const account = await prisma.account.findUnique({ where: { id: accountId } });

  if (!account) throw new Error("Account not found.");
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

  return prisma.subscriptionPayment.create({
    data: {
      accountId,
      planKey,
      amountMinorUnits,
      currency: account.currency,
      status: "pending",
    },
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
    const payment = await tx.subscriptionPayment.findUnique({
      where: { id: paymentId },
      include: { account: true },
    });

    if (!payment) throw new Error("Subscription payment not found.");
    if (payment.status === "paid") return payment;
    if (payment.status !== "pending") throw new Error("Subscription payment is not payable.");
    if (payment.currency !== payment.account.currency) {
      throw new Error("Payment currency does not match the account market.");
    }
    if (!isWeeklyPricingEligible(payment.account)) {
      throw new Error("This account is not eligible for paid weekly access.");
    }

    const now = new Date();
    const currentEnd =
      payment.account.subscriptionStatus === "active" &&
      payment.account.subscriptionEndsAt &&
      payment.account.subscriptionEndsAt > now
        ? payment.account.subscriptionEndsAt
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
