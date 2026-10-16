import { prisma } from "@/lib/prisma";
import { isUkAccount } from "@/lib/uk";

export const DRIVER_NORMAL_TARGET = 30;
export const POSTER_NORMAL_POSTED_TARGET = 60;
export const POSTER_NORMAL_COMPLETED_TARGET = 15;

export type QualificationWindow = { startAt: Date; endAt: Date };

function clampRatio(
  value: number
) {
  if (!Number.isFinite(value)) {
    return 0;
  }

  return Math.max(
    0,
    Math.min(1, value)
  );
}

function roundTarget(
  value: number
) {
  return Math.max(
    0,
    Math.ceil(value)
  );
}

export function calculateDriverFairTarget(
  suitableOpportunities: number
) {
  const fairnessRatio =
    clampRatio(
      suitableOpportunities /
        DRIVER_NORMAL_TARGET
    );

  const adjustedTarget =
    roundTarget(
      DRIVER_NORMAL_TARGET *
        fairnessRatio
    );

  return {
    normalTarget:
      DRIVER_NORMAL_TARGET,

    suitableOpportunities,

    fairnessRatio,

    adjustedTarget,
  };
}

export function calculatePosterFairPostedTarget(
  reasonableOpportunities: number
) {
  const fairnessRatio =
    clampRatio(
      reasonableOpportunities /
        POSTER_NORMAL_POSTED_TARGET
    );

  const adjustedTarget =
    roundTarget(
      POSTER_NORMAL_POSTED_TARGET *
        fairnessRatio
    );

  return {
    normalTarget:
      POSTER_NORMAL_POSTED_TARGET,

    reasonableOpportunities,

    fairnessRatio,

    adjustedTarget,
  };
}

export function participationIsSufficient(
  opportunities: number,
  meaningfulResponses: number
) {
  if (
    opportunities <= 0
  ) {
    return false;
  }

  return (
    meaningfulResponses /
      opportunities >=
    0.2
  );
}

export function calculateMarketplaceDriverRatio(
  activeEligibleDrivers: number,
  suitableJobs: number
) {
  if (
    activeEligibleDrivers <= 0
  ) {
    return {
      requiredOpportunities: 0,
      suitableJobs,
      ratio: 1,
    };
  }

  const requiredOpportunities =
    activeEligibleDrivers *
    DRIVER_NORMAL_TARGET;

  return {
    requiredOpportunities,
    suitableJobs,

    ratio: clampRatio(
      suitableJobs /
        requiredOpportunities
    ),
  };
}

export async function getDriverCompletedJobs(
  accountId: string,
  window?: QualificationWindow
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
    return 0;
  }

  return prisma.job.count({
    where: {
      acceptedById: accountId,
      status: "completed",
      ...(window
        ? {
            activities: {
              some: {
                action: "DELIVERY_CONFIRMED",
                toStatus: "completed",
                createdAt: { gte: window.startAt, lte: window.endAt },
              },
            },
          }
        : {}),
    },
  });
}

export async function getDriverOpportunityCount(
  accountId: string,
  window?: QualificationWindow
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
    return 0;
  }

  return prisma.driverOpportunity.count({
    where: {
      driverId: accountId,
      ...(window
        ? { exposedAt: { gte: window.startAt, lte: window.endAt } }
        : {}),
    },
  });
}

export async function evaluateDriverFairness(
  accountId: string,
  window?: QualificationWindow
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
      normalTarget:
        DRIVER_NORMAL_TARGET,

      suitableOpportunities: 0,

      fairnessRatio: 0,

      adjustedTarget: 0,

      actualCompletedJobs: 0,

      qualified: false,

      ukEligible: false,
    };
  }

  const [
    opportunities,
    completedJobs,
  ] = await Promise.all([
    getDriverOpportunityCount(accountId, window),
    getDriverCompletedJobs(accountId, window),
  ]);

  const result =
    calculateDriverFairTarget(
      opportunities
    );

  return {
    ...result,

    actualCompletedJobs:
      completedJobs,

    qualified:
      completedJobs >=
      result.adjustedTarget,

    ukEligible: true,
  };
}