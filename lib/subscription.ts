import { prisma } from "@/lib/prisma";
import { majorUnitsToMinorUnits } from "@/lib/currencyMinorUnits";
import { getFleetPrice, getIndividualWeeklyPrice, getPosterMonthlyPrice, INDIVIDUAL_ACCESS_DAYS, POSTER_MONTHLY_ACCESS_MONTHS, isWeeklyPricingEligible } from "@/lib/pricing";

const DAY_MS = 24 * 60 * 60 * 1000;

export function getPaidPlanKey(account: {
  country?: string | null;
  currency?: string | null;
  planType?: "individual" | "fleet" | null;
  type?: "poster" | "driver" | "both" | null;
  hasVerifiedVehicle?: boolean | null;
}) {
  if (!isWeeklyPricingEligible(account)) return null;
  if (account.type === "poster" || (account.type === "both" && !account.hasVerifiedVehicle)) return "poster-monthly";
  return account.planType === "fleet" ? "fleet" : "individual";
}

/** Return the price in minor currency units for the account currency. */
export function getPaidPriceMinorUnits(account: {
  country?: string | null;
  currency?: string | null;
  planType?: "individual" | "fleet" | null;
  fleetVehicleCount?: number | null;
  type?: "poster" | "driver" | "both" | null;
  hasVerifiedVehicle?: boolean | null;
}) {
  if (!isWeeklyPricingEligible(account)) return null;

  const planKey = getPaidPlanKey(account);
  const price = planKey === "poster-monthly"
    ? getPosterMonthlyPrice(account)
    : account.planType === "fleet"
      ? getFleetPrice(account.fleetVehicleCount ?? 0, account)
      : getIndividualWeeklyPrice(account);

  if (price === null) return null;
  const currency = account.currency ?? "GBP";
  return majorUnitsToMinorUnits(price, currency);
}

/** Backwards-compatible alias. The integer is currency minor units, not always GBP pence. */
export const getPaidPricePence = getPaidPriceMinorUnits;

export function calculatePaidAccessEnd(startAt: Date, planKey: string | null = "individual") {
  if (planKey === "poster-monthly") {
    const end = new Date(startAt);
    const dayOfMonth = end.getUTCDate();
    end.setUTCDate(1);
    end.setUTCMonth(end.getUTCMonth() + POSTER_MONTHLY_ACCESS_MONTHS);
    const lastDay = new Date(Date.UTC(end.getUTCFullYear(), end.getUTCMonth() + 1, 0)).getUTCDate();
    end.setUTCDate(Math.min(dayOfMonth, lastDay));
    return end;
  }
  return new Date(startAt.getTime() + INDIVIDUAL_ACCESS_DAYS * DAY_MS);
}

export async function createPendingSubscriptionPayment(accountId: string) {
  const account = await prisma.account.findUnique({
    where: { id: accountId },
    include: { vehicles: { where: { verificationStatus: "verified" }, select: { id: true }, take: 1 } },
  });

  if (!account) throw new Error("Account not found.");
  if (!isWeeklyPricingEligible(account)) {
    throw new Error("Paid weekly access is available to supported non-India markets.");
  }
  if (account.verificationStatus !== "verified" && !account.isTester) {
    throw new Error("Account must be successfully verified before purchasing access.");
  }

  const hasVerifiedVehicle = account.vehicles.length > 0;
  const pricingAccount = { ...account, hasVerifiedVehicle };
  const planKey = getPaidPlanKey(pricingAccount);
  if (planKey === "poster-monthly" && account.companyVerificationStatus !== "verified") {
    throw new Error("Business verification must be approved before purchasing poster access.");
  }
  if (planKey !== "poster-monthly" && !hasVerifiedVehicle) {
    throw new Error("Complete vehicle verification before purchasing driver access.");
  }
  const amountMinorUnits = getPaidPriceMinorUnits(pricingAccount);
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
    const accessEndsAt = calculatePaidAccessEnd(currentEnd, payment.planKey);

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
