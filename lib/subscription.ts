import { prisma } from "@/lib/prisma";
import { getFleetPrice, INDIVIDUAL_PRICE_GBP, INDIVIDUAL_ACCESS_DAYS } from "@/lib/pricing";
import { isUkAccount } from "@/lib/uk";

const DAY_MS = 24 * 60 * 60 * 1000;

export function getPaidPlanKey(account: {
  country?: string | null;
  currency?: string | null;
  planType?: "individual" | "fleet" | null;
}) {
  if (!isUkAccount(account)) return null;
  return account.planType === "fleet" ? "fleet" : "individual";
}

export function getPaidPricePence(account: {
  country?: string | null;
  currency?: string | null;
  planType?: "individual" | "fleet" | null;
  fleetVehicleCount?: number | null;
}) {
  if (!isUkAccount(account)) return null;

  if (account.planType === "fleet") {
    const vehicleCount = account.fleetVehicleCount ?? 0;
    const price = getFleetPrice(vehicleCount, account);

    return price === null ? null : Math.round(price * 100);
  }

  return Math.round(INDIVIDUAL_PRICE_GBP * 100);
}

export function calculatePaidAccessEnd(startAt: Date) {
  return new Date(
    startAt.getTime() + INDIVIDUAL_ACCESS_DAYS * DAY_MS
  );
}

export async function createPendingSubscriptionPayment(accountId: string) {
  const account = await prisma.account.findUnique({
    where: { id: accountId },
  });

  if (!account) {
    throw new Error("Account not found.");
  }

  if (!isUkAccount(account)) {
    throw new Error("Paid UK subscriptions are currently available only for GB accounts using GBP.");
  }

  if (account.verificationStatus !== "verified" && !account.isTester) {
    throw new Error("Account must be successfully verified before purchasing access.");
  }

  const planKey = getPaidPlanKey(account);
  const amountPence = getPaidPricePence(account);

  if (!planKey || amountPence === null) {
    throw new Error("This account does not have a valid UK subscription price.");
  }

  return prisma.subscriptionPayment.create({
    data: {
      accountId,
      planKey,
      amountPence,
      currency: "GBP",
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

    if (!payment) {
      throw new Error("Subscription payment not found.");
    }

    if (payment.status === "paid") {
      return payment;
    }

    if (payment.status !== "pending") {
      throw new Error("Subscription payment is not payable.");
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
