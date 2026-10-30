import { prisma } from "@/lib/prisma";
import { isUkAccount } from "@/lib/uk";
import {
  startPromotionForVerifiedAccount,
} from "@/lib/promotion";
import { markReferralVerified } from "@/lib/referrals";

export function getVerificationFeeMinorUnits(
  account: {
    type: "poster" | "driver" | "both";
    planType: "individual" | "fleet";
    fleetVehicleCount?: number | null;
    currency?: string | null;
  }
) {
  /*
   * The UK schedule is mirrored numerically in euro markets.
   * Individual: 2.00 in the account currency.
   * Fleet: 2.00 in the account currency + 0.50 per vehicle.
   * These integers are minor currency units, not necessarily pence.
   */
  if (account.planType === "fleet") {
    const vehicleCount = account.fleetVehicleCount || 0;
    return 200 + vehicleCount * 50;
  }
  return 200;
}

/** Backwards-compatible alias; EUR accounts also use currency minor units (cents). */
export const getVerificationFeePence = getVerificationFeeMinorUnits;

function addWorkingDays(
  date: Date,
  days: number
) {
  const result =
    new Date(date);

  let remaining = days;

  while (remaining > 0) {
    result.setDate(
      result.getDate() + 1
    );

    const day =
      result.getDay();

    if (
      day !== 0 &&
      day !== 6
    ) {
      remaining--;
    }
  }

  return result;
}

export async function createVerificationAttempt(
  accountId: string
) {
  const account =
    await prisma.account.findUnique({
      where: {
        id: accountId,
      },
    });

  if (!account) {
    throw new Error(
      "Account not found."
    );
  }

  if (
    account.verificationStatus ===
    "verified"
  ) {
    return {
      alreadyVerified: true,
      account,
    };
  }

  const attempts =
    await prisma.verificationAttempt.findMany(
      {
        where: {
          accountId,
        },
        orderBy: {
          attemptNumber:
            "desc",
        },
      }
    );

  if (
    attempts.length >= 2 &&
    attempts[0]?.status !==
      "successful"
  ) {
    throw new Error(
      "The maximum automated verification attempts have been reached. The account requires final review."
    );
  }

  const attemptNumber =
    attempts.length + 1;

  const feeMinorUnits =
    attemptNumber === 1
      ? getVerificationFeeMinorUnits(account)
      : 0;

  const feeStatus =
    attemptNumber === 1
      ? "unpaid"
      : "waived";

  const attempt =
    await prisma.verificationAttempt.create(
      {
        data: {
          accountId,
          attemptNumber,
          status:
            attemptNumber === 1
              ? "awaiting_payment"
              : "correction",
          feeMinorUnits,
          feeCurrency: account.currency,
          feeStatus,
        },
      }
    );

  await prisma.account.update({
    where: {
      id: accountId,
    },
    data: {
      verificationStatus:
        attemptNumber === 1
          ? "payment_pending"
          : "pending",
      lastActivityAt:
        new Date(),
    },
  });

  return {
    alreadyVerified: false,
    attempt,
    feeMinorUnits,
    // Legacy response alias until all integrations use currency-neutral names.
    feePence: feeMinorUnits,
    feeCurrency: account.currency,
  };
}

export async function markVerificationSuccessful(
  attemptId: string,
  providerReference?: string
) {
  const account = await prisma.$transaction(async (tx) => {
    const attempt = await tx.verificationAttempt.findUnique({
      where: { id: attemptId },
      include: { account: true },
    });

    if (!attempt) {
      throw new Error("Verification attempt not found.");
    }

    // Webhook retries are idempotent. A late success must never resurrect
    // an expired/terminal attempt or overwrite a newer account state.
    if (attempt.status === "successful") {
      return attempt.account;
    }

    const claimed = await tx.verificationAttempt.updateMany({
      where: {
        id: attemptId,
        status: { in: ["awaiting_payment", "pending", "correction", "manual_review"] },
      },
      data: {
        status: "successful",
        completedAt: new Date(),
        notes: providerReference
          ? `Provider reference: ${providerReference}`
          : undefined,
      },
    });

    if (claimed.count !== 1) {
      throw new Error("Verification attempt is no longer eligible for completion.");
    }

    const accountUpdate = await tx.account.updateMany({
      where: {
        id: attempt.accountId,
        verificationStatus: { in: ["payment_pending", "pending", "failed", "manual_review"] },
      },
      data: {
        verificationStatus: "verified",
        verifiedAt: new Date(),
        lastActivityAt: new Date(),
        inactiveSince: null,
      },
    });

    if (accountUpdate.count !== 1) {
      throw new Error("Account is no longer eligible for verification.");
    }

    return tx.account.findUniqueOrThrow({
      where: { id: attempt.accountId },
    });
  });

  // Keep these side effects retryable and outside the DB transaction.
  // Their own helpers must remain idempotent.
  if (isUkAccount(account)) {
    try {
      await startPromotionForVerifiedAccount(account.id);
    } catch (error) {
      console.error("Promotion startup error:", {
        errorName: error instanceof Error ? error.name : "UnknownError",
      });
    }

    await markReferralVerified(account.id);
  }

  return account;
}

export async function markVerificationFailed(
  attemptId: string,
  failureReasons?: unknown
) {
  return prisma.$transaction(async (tx) => {
    const attempt = await tx.verificationAttempt.findUnique({
      where: { id: attemptId },
    });

    if (!attempt) {
      throw new Error("Verification attempt not found.");
    }

    // A delayed failure event must not downgrade a completed verification.
    if (attempt.status === "successful") {
      return { status: "successful", deadline: null };
    }

    const now = new Date();
    const nextDeadline = addWorkingDays(now, attempt.attemptNumber === 1 ? 14 : 7);
    const status = attempt.attemptNumber >= 2 ? "manual_review" : "correction";

    const changed = await tx.verificationAttempt.updateMany({
      where: {
        id: attemptId,
        status: { in: ["awaiting_payment", "pending", "correction", "manual_review"] },
      },
      data: {
        status,
        failedAt: now,
        correctionDeadline: attempt.attemptNumber === 1 ? nextDeadline : null,
        finalEvidenceDeadline: attempt.attemptNumber >= 2 ? nextDeadline : null,
        failureReasons: failureReasons || undefined,
      },
    });

    if (changed.count !== 1) {
      throw new Error("Verification attempt is no longer eligible for failure processing.");
    }

    const accountStatus = attempt.attemptNumber >= 2 ? "manual_review" : "failed";
    await tx.account.updateMany({
      where: {
        id: attempt.accountId,
        verificationStatus: { in: ["payment_pending", "pending", "failed", "manual_review"] },
      },
      data: { verificationStatus: accountStatus },
    });

    return { status, deadline: nextDeadline };
  });
}
