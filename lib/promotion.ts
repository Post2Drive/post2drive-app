import { prisma } from "@/lib/prisma";
import { isUkAccount } from "@/lib/uk";

export const INDIVIDUAL_INITIAL_FREE_MONTHS = 3;
export const INDIVIDUAL_MAX_EXTENSION_COUNT = 3;

export const FLEET_INITIAL_FREE_MONTHS = 3;
export const FLEET_MAX_EXTENSION_COUNT = 3;

export const EXTENSION_MONTHS = 3;

function addMonths(date: Date, months: number) {
  const result = new Date(date);
  const day = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate();
  result.setUTCDate(Math.min(day, lastDay));
  return result;
}

function minDate(a: Date, b: Date) {
  return a.getTime() <= b.getTime() ? a : b;
}

export async function getPromotion() {
  // Keep a brand-new environment usable even if the initial promotion seed
  // has not been applied yet. The upsert is race-safe when several first
  // requests arrive together and never overwrites an operator-managed row.
  return prisma.promotionConfig.upsert({
    where: { id: "global" },
    update: {},
    create: {
      id: "global",
      name: "Launch Promotion",
      startAt: new Date(),
      endAt: new Date("2027-12-31T23:59:59.999Z"),
      active: true,
    },
  });
}

export async function isPromotionActive(
  now = new Date()
) {
  const promotion = await getPromotion();

  return (
    promotion.active &&
    now >= promotion.startAt &&
    now <= promotion.endAt
  );
}

export function getMaximumExtensionCount(
  planType: "individual" | "fleet"
) {
  // Same maximum extension rule for individual and fleet accounts.
  return 3;
}

export function getInitialFreeMonths(
  planType: "individual" | "fleet"
) {
  return 3;
}

/**
 * Calculates the promotional access end date.
 *
 * IMPORTANT:
 * This is the UK promotion.
 * The global promotion end date is always the hard ceiling.
 */
export async function calculatePromotionalEnd(
  account: {
    country: string;
    currency: string;
    planType: "individual" | "fleet";
    trialStartedAt: Date;
    freeMonthsEarned: number;
  }
) {
  if (!isUkAccount(account)) {
    return null;
  }

  const promotion = await getPromotion();

  const totalFreeMonths =
    getInitialFreeMonths(account.planType) +
    account.freeMonthsEarned;

  const earnedEnd = addMonths(
    account.trialStartedAt,
    totalFreeMonths
  );

  return minDate(
    earnedEnd,
    promotion.endAt
  );
}

/**
 * Starts the UK promotional period after successful verification, or for an authorised tester.
 * Only GB + GBP accounts are eligible; tester accounts are not marked verified.
 */
export async function startPromotionForVerifiedAccount(
  accountId: string
) {
  const promotion = await getPromotion();

  const now = new Date();

  if (
    !promotion.active ||
    now < promotion.startAt ||
    now > promotion.endAt
  ) {
    throw new Error(
      "The UK promotional programme is not currently active."
    );
  }

  return prisma.$transaction(async tx => {
    // Verification retries may run these post-transaction side effects
    // concurrently. Lock the account so only one promotion is ever started.
    const lockedAccounts = await tx.$queryRawUnsafe<Array<{ id: string }>>(
      'SELECT "id" FROM "Account" WHERE "id" = $1 FOR UPDATE', accountId,
    );
    if (lockedAccounts.length !== 1) throw new Error("Account not found.");

    const account = await tx.account.findUnique({ where: { id: accountId } });
    if (!account) throw new Error("Account not found.");
    if (account.deletionRequestedAt) throw new Error("Account is pending deletion.");
    if (account.verificationStatus === "suspended") throw new Error("Account is suspended.");

    if (!isUkAccount(account)) {
      throw new Error(
        "The UK promotional programme is available only to GB accounts using GBP."
      );
    }

    if (account.verificationStatus !== "verified" && !account.isTester) {
      throw new Error(
        "Account must be successfully verified before promotional membership starts."
      );
    }

    if (account.trialStartedAt) return account;

    const initialMonths = getInitialFreeMonths(account.planType);
    const initialEnd = minDate(addMonths(now, initialMonths), promotion.endAt);

    return tx.account.update({
      where: { id: accountId },
      data: {
        promotionParticipant: true,
        trialStartedAt: now,
        trialEndsAt: initialEnd,
        freeEndsAt: initialEnd,
        freeMonthsEarned: 0,
        extensionCount: 0,
        subscriptionStatus: "promotional",
        lastActivityAt: now,
        inactiveSince: null,
      },
    });
  });
}
