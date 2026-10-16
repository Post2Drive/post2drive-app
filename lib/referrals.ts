import { prisma } from "@/lib/prisma";
import { isUkAccount } from "@/lib/uk";

export const REFERRAL_TARGET = 15;
export const REFERRAL_JOB_TARGET = 5;

export async function createReferral(
  referrerCode: string,
  referredAccountId: string
) {
  const code =
    referrerCode.trim().toUpperCase();

  const [
    referrer,
    referredAccount,
  ] = await Promise.all([
    prisma.account.findUnique({
      where: {
        displayId: code,
      },
    }),

    prisma.account.findUnique({
      where: {
        id: referredAccountId,
      },
    }),
  ]);

  if (!referrer) {
    throw new Error(
      "Invalid referral code."
    );
  }

  if (!referredAccount) {
    throw new Error(
      "Referred account not found."
    );
  }

  if (
    referrer.id ===
    referredAccountId
  ) {
    throw new Error(
      "You cannot refer yourself."
    );
  }

  // UK referral programme:
  // BOTH sides must be GB + GBP.
  if (
    !isUkAccount(referrer) ||
    !isUkAccount(referredAccount)
  ) {
    throw new Error(
      "UK promotional referrals are available only to accounts using GB and GBP."
    );
  }

  const existing =
    await prisma.referral.findUnique({
      where: {
        referredAccountId,
      },
    });

  if (existing) {
    throw new Error(
      "This account already has a referral attribution."
    );
  }

  return prisma.referral.create({
    data: {
      referrerId:
        referrer.id,

      referredAccountId,

      status:
        "pending",
    },
  });
}

export async function markReferralVerified(
  accountId: string
) {
  const referral =
    await prisma.referral.findUnique({
      where: {
        referredAccountId:
          accountId,
      },

      include: {
        referrer: true,
        referredAccount: true,
      },
    });

  if (!referral) {
    return null;
  }

  if (
    !isUkAccount(
      referral.referrer
    ) ||
    !isUkAccount(
      referral.referredAccount
    )
  ) {
    return null;
  }

  if (
    referral.status !==
    "pending"
  ) {
    return referral;
  }

  return prisma.referral.update({
    where: {
      id: referral.id,
    },

    data: {
      verifiedAt:
        new Date(),
    },
  });
}

export async function getReferralProgress(
  accountId: string
) {
  const account =
    await prisma.account.findUnique({
      where: {
        id: accountId,
      },

      select: {
        country: true,
        currency: true,
      },
    });

  if (
    !account ||
    !isUkAccount(account)
  ) {
    return {
      totalReferrals: 0,
      verifiedReferrals: 0,
      completedReferrals: 0,
      requiredReferrals:
        REFERRAL_TARGET,
      requiredCompletedReferrals:
        REFERRAL_JOB_TARGET,
      referralTargetReached:
        false,
      completedReferralTargetReached:
        false,
    };
  }

  const referrals =
    await prisma.referral.findMany({
      where: {
        referrerId:
          accountId,
      },

      select: {
        id: true,
        status: true,
        verifiedAt: true,
        qualifyingJobAt:
          true,
      },
    });

  const verified =
    referrals.filter(
      (referral) =>
        referral.verifiedAt !==
        null
    );

  const completed =
    referrals.filter(
      (referral) =>
        referral.qualifyingJobAt !==
        null
    );

  return {
    totalReferrals:
      referrals.length,

    verifiedReferrals:
      verified.length,

    completedReferrals:
      completed.length,

    requiredReferrals:
      REFERRAL_TARGET,

    requiredCompletedReferrals:
      REFERRAL_JOB_TARGET,

    referralTargetReached:
      verified.length >=
      REFERRAL_TARGET,

    completedReferralTargetReached:
      completed.length >=
      REFERRAL_JOB_TARGET,
  };
}

/**
 * Checks whether a completed job qualifies
 * the referred account.
 *
 * The referred account may be either:
 * - the poster
 * - the accepted driver
 *
 * Only the first qualifying genuine completed
 * job counts.
 */
export async function qualifyReferralFromCompletedJob(
  accountId: string,
  jobId: string
) {
  const referral =
    await prisma.referral.findUnique({
      where: {
        referredAccountId:
          accountId,
      },

      include: {
        referrer: true,
        referredAccount: true,
      },
    });

  if (!referral) {
    return null;
  }

  if (
    !isUkAccount(
      referral.referrer
    ) ||
    !isUkAccount(
      referral.referredAccount
    )
  ) {
    return null;
  }

  if (!referral.verifiedAt) {
    return null;
  }

  if (
    referral.status ===
    "qualified"
  ) {
    return referral;
  }

  const job =
    await prisma.job.findUnique({
      where: {
        id: jobId,
      },
    });

  if (
    !job ||
    job.status !==
      "completed"
  ) {
    return null;
  }

  const isInvolved =
    job.posterId ===
      accountId ||
    job.acceptedById ===
      accountId;

  if (!isInvolved) {
    return null;
  }

  // A genuine completed job needs two
  // different marketplace accounts.
  if (
    !job.acceptedById ||
    job.posterId ===
      job.acceptedById
  ) {
    return null;
  }

  const qualifiedReferral =
    await prisma.referral.update({
      where: {
        id: referral.id,
      },

      data: {
        status:
          "qualified",

        qualifyingJobId:
          jobId,

        qualifyingJobAt:
          new Date(),
      },
    });

  return qualifiedReferral;
}