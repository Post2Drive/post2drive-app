import { prisma } from "@/lib/prisma";
import { majorUnitsToMinorUnits } from "@/lib/currencyMinorUnits";
import { getFleetPrice, getIndividualWeeklyPrice, INDIVIDUAL_ACCESS_DAYS, isWeeklyPricingEligible, POSTER_MONTHLY_PRICE_GBP } from "@/lib/pricing";
import { getEntitlementStatus } from "@/lib/access";
import { addMonths, creditMinorUnits } from "@/lib/launchWindows";

const DAY_MS = 24 * 60 * 60 * 1000;
// Shorter than a provider checkout session's 24-hour life, so a reused payment's checkout is still open.
export const PENDING_PAYMENT_REUSE_MS = 23 * 60 * 60 * 1000;

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

    // A payment is only created for a chargeable period running NOW: never ahead of a free
    // window/trial, and never for a driver waiting on the driver-window waitlist.
    if (!billing || billing.plan === "none" || !billing.chargeableFrom || !billing.paymentDue) {
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

    // Repeat requests for the same plan and amount reuse the open pending payment, so
    // one access period maps to one provider checkout (see PENDING_PAYMENT_REUSE_MS).
    const reusable = await tx.subscriptionPayment.findFirst({
      where: {
        accountId,
        planKey,
        amountMinorUnits,
        currency: account.currency,
        status: "pending",
        createdAt: { gt: new Date(Date.now() - PENDING_PAYMENT_REUSE_MS) },
      },
      orderBy: { createdAt: "desc" },
    });
    if (reusable) return reusable;

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

/** Record which provider checkout belongs to a pending payment. Never marks anything paid. */
export async function attachCheckoutToPayment(paymentId: string, provider: string, providerCheckoutId: string) {
  const result = await prisma.subscriptionPayment.updateMany({
    where: { id: paymentId, status: "pending", OR: [{ providerCheckoutId: null }, { providerCheckoutId }] },
    data: { provider, providerCheckoutId },
  });
  return result.count === 1;
}

export async function confirmSubscriptionPayment(
  paymentId: string,
  details?: {
    provider?: string;
    providerPaymentId?: string;
    providerCheckoutId?: string;
    /** Optional event bindings: when the provider event names them they must match the stored payment. */
    expectedAccountId?: string;
    expectedAmountMinorUnits?: number;
    expectedCurrency?: string;
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
    // Bind the event to this payment: account, amount and currency must agree when supplied.
    if ((details?.expectedAccountId !== undefined && details.expectedAccountId !== payment.accountId) ||
        (details?.expectedAmountMinorUnits !== undefined && details.expectedAmountMinorUnits !== payment.amountMinorUnits) ||
        (details?.expectedCurrency !== undefined && details.expectedCurrency !== payment.currency)) {
      throw new Error("Subscription event does not match the payment.");
    }
    if (payment.status === "paid") {
      // Idempotent only for the same provider event; a different provider reference is a conflict.
      if (payment.providerPaymentId && details?.providerPaymentId !== payment.providerPaymentId) {
        throw new Error("Subscription payment is not payable.");
      }
      return payment;
    }
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

export type ProviderEventOutcome =
  | "applied" | "duplicate" | "ignored" | "unknown_payment" | "rejected_mismatch" | "not_payable" | "recorded";

export type VerifiedProviderEvent =
  | { kind: "paid"; eventId: string; paymentId: string; accountId: string | null; amountMinorUnits: number; currency: string; providerPaymentId: string; providerCheckoutId: string }
  | { kind: "expired" | "failed"; eventId: string; paymentId: string; providerCheckoutId: string | null }
  | { kind: "refunded"; eventId: string; providerPaymentId: string; amountRefundedMinorUnits: number; fullyRefunded: boolean; currency: string }
  | { kind: "ignored"; eventId: string; type: string };

const NON_RETRYABLE_CONFIRM_ERRORS: Record<string, ProviderEventOutcome> = {
  "Subscription payment not found.": "unknown_payment",
  "Subscription event does not match the payment.": "rejected_mismatch",
  "Subscription payment is not payable.": "not_payable",
  "Account is pending deletion.": "not_payable",
  "Account is suspended.": "not_payable",
  "Payment currency does not match the account market.": "rejected_mismatch",
  "This account is not eligible for paid weekly access.": "not_payable",
};

/**
 * Apply one SIGNATURE-VERIFIED provider event exactly once.
 *
 * Callers must have authenticated the event (lib/stripeProvider.parseStripeWebhook).
 * The (provider, eventId) ledger row makes redelivery a no-op. Each transition is
 * also idempotent by itself, so a crash between the transition and the ledger write
 * is repaired by the provider's retry. Unexpected database errors are thrown so the
 * provider retries; business outcomes are returned and acknowledged.
 */
export async function applyVerifiedProviderEvent(provider: string, event: VerifiedProviderEvent): Promise<ProviderEventOutcome> {
  const seen = await prisma.paymentProviderEvent.findUnique({
    where: { provider_eventId: { provider, eventId: event.eventId } },
    select: { id: true },
  });
  if (seen) return "duplicate";

  let outcome: ProviderEventOutcome = "ignored";
  let paymentId: string | null = null;
  const type = event.kind === "ignored" ? event.type : event.kind;

  if (event.kind === "paid") {
    paymentId = event.paymentId;
    try {
      await confirmSubscriptionPayment(event.paymentId, {
        provider,
        providerPaymentId: event.providerPaymentId,
        providerCheckoutId: event.providerCheckoutId,
        expectedAccountId: event.accountId ?? undefined,
        expectedAmountMinorUnits: event.amountMinorUnits,
        expectedCurrency: event.currency,
      });
      outcome = "applied";
    } catch (error) {
      const known = error instanceof Error ? NON_RETRYABLE_CONFIRM_ERRORS[error.message] : undefined;
      const duplicateReference = (error as { code?: string } | null)?.code === "P2002";
      if (!known && !duplicateReference) throw error;
      outcome = known ?? "not_payable";
      // Money may have been taken without access being granted: this needs a person to look.
      console.error("Verified provider payment could not be applied; manual review needed.", { provider, outcome });
    }
  } else if (event.kind === "expired" || event.kind === "failed") {
    paymentId = event.paymentId;
    const updated = await prisma.subscriptionPayment.updateMany({
      where: {
        id: event.paymentId,
        status: "pending",
        ...(event.providerCheckoutId ? { OR: [{ providerCheckoutId: null }, { providerCheckoutId: event.providerCheckoutId }] } : {}),
      },
      data: { status: event.kind },
    });
    outcome = updated.count === 1 ? "applied" : "not_payable";
  } else if (event.kind === "refunded") {
    outcome = await prisma.$transaction(async (tx) => {
      const payment = await tx.subscriptionPayment.findUnique({ where: { providerPaymentId: event.providerPaymentId } });
      if (!payment || payment.provider !== provider) return "unknown_payment" as const;
      paymentId = payment.id;
      // A partial refund is recorded in the ledger only; access is unchanged.
      if (!event.fullyRefunded || event.amountRefundedMinorUnits < payment.amountMinorUnits) return "recorded" as const;
      if (payment.status === "refunded") return "duplicate" as const;
      if (payment.status !== "paid") return "not_payable" as const;

      const locked = await tx.$queryRawUnsafe<Array<{ id: string }>>(
        'SELECT "id" FROM "Account" WHERE "id" = $1 FOR UPDATE', payment.accountId,
      );
      if (locked.length !== 1) return "unknown_payment" as const;
      const account = await tx.account.findUnique({ where: { id: payment.accountId } });
      const now = new Date();
      await tx.subscriptionPayment.update({ where: { id: payment.id }, data: { status: "refunded", refundedAt: now } });
      // Take back only the access this payment added, and only while it is still the
      // payment that set the current end date (a later payment keeps its own period).
      if (account && payment.accessEndsAt && account.subscriptionEndsAt &&
          account.subscriptionEndsAt.getTime() === payment.accessEndsAt.getTime()) {
        const restoredEnd = payment.accessStartedAt && payment.accessStartedAt > now ? payment.accessStartedAt : now;
        await tx.account.update({
          where: { id: account.id },
          data: restoredEnd > now
            ? { subscriptionEndsAt: restoredEnd }
            : { subscriptionEndsAt: restoredEnd, subscriptionStatus: "inactive" },
        });
      }
      return "applied" as const;
    });
  }

  try {
    await prisma.paymentProviderEvent.create({
      data: { provider, eventId: event.eventId, type: type.slice(0, 100), outcome, paymentId },
    });
  } catch (error) {
    // A concurrent delivery of the same event recorded it first.
    if ((error as { code?: string } | null)?.code === "P2002") return "duplicate";
    throw error;
  }
  return outcome;
}
