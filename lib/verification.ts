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
  const attempt =
    await prisma.verificationAttempt.findUnique(
      {
        where: {
          id: attemptId,
        },
        include: {
          account: true,
        },
      }
    );

  if (!attempt) {
    throw new Error(
      "Verification attempt not found."
    );
  }

  const account =
    attempt.account;

  const updated =
    await prisma.$transaction(
      async (tx) => {
        await tx.verificationAttempt.update({
          where: {
            id: attemptId,
          },
          data: {
            status:
              "successful",
            completedAt:
              new Date(),
            notes:
              providerReference
                ? `Provider reference: ${providerReference}`
                : undefined,
          },
        });

        return tx.account.update({
          where: {
            id: account.id,
          },
          data: {
            verificationStatus:
              "verified",
            verifiedAt:
              new Date(),
            lastActivityAt:
              new Date(),
            inactiveSince:
              null,
          },
        });
      }
    );

  /*
   * Start the UK promotion and mark referral verification
   * independently after successful identity verification.
   */
  if (isUkAccount(updated)) {
    try {
      await startPromotionForVerifiedAccount(
        updated.id
      );
    } catch (error) {
      console.error(
        "Promotion startup error:",
        error
      );
    }

    try {
      await markReferralVerified(updated.id);
    } catch (error) {
      console.error(
        "Referral verification error:",
        error
      );
      throw error;
    }
  }

  return updated;
}

export async function markVerificationFailed(
  attemptId: string,
  failureReasons?: unknown
) {
  const attempt =
    await prisma.verificationAttempt.findUnique(
      {
        where: {
          id: attemptId,
        },
        include: {
          account: true,
        },
      }
    );

  if (!attempt) {
    throw new Error(
      "Verification attempt not found."
    );
  }

  const now =
    new Date();

  const nextDeadline =
    attempt.attemptNumber === 1
      ? addWorkingDays(
          now,
          14
        )
      : addWorkingDays(
          now,
          7
        );

  const status =
    attempt.attemptNumber >= 2
      ? "manual_review"
      : "correction";

  await prisma.verificationAttempt.update({
    where: {
      id: attemptId,
    },
    data: {
      status,
      failedAt: now,
      correctionDeadline:
        attempt.attemptNumber === 1
          ? nextDeadline
          : null,
      finalEvidenceDeadline:
        attempt.attemptNumber >= 2
          ? nextDeadline
          : null,
      failureReasons:
        failureReasons || undefined,
    },
  });

  await prisma.account.update({
    where: {
      id: attempt.accountId,
    },
    data: {
      verificationStatus:
        attempt.attemptNumber >= 2
          ? "manual_review"
          : "failed",
    },
  });

  return {
    status,
    deadline:
      nextDeadline,
  };
}