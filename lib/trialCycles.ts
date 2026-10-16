import { prisma } from "@/lib/prisma";
import { getPromotion } from "@/lib/promotion";
import { getPosterQualification, getDriverQualification } from "@/lib/qualification";
import { POSTER_NORMAL_POSTED_TARGET, POSTER_NORMAL_COMPLETED_TARGET, DRIVER_NORMAL_TARGET, type QualificationWindow } from "@/lib/fairness";
import { isUkAccount } from "@/lib/uk";

const EXTENSION_MONTHS = 3;
const MAX_EXTENSIONS = 3;
const GRACE_DAYS = 30;
const GRACE_RATIO = 2 / 3;

function addMonths(date: Date, months: number) {
  const result = new Date(date);
  const day = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate();
  result.setUTCDate(Math.min(day, lastDay));
  return result;
}

function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

function minDate(a: Date, b: Date) {
  return a.getTime() <= b.getTime() ? a : b;
}

function graceThreshold(target: number) {
  return Math.ceil(target * GRACE_RATIO);
}

type CycleMetrics = {
  posterPostedActual: number;
  posterCompletedActual: number;
  driverCompletedActual: number;
  verifiedReferralsActual: number;
  completedReferralsActual: number;
  posterAdjustedTarget: number;
  driverAdjustedTarget: number;
  posterFairnessRatio: number;
  driverFairnessRatio: number;
};

function fullyQualified(metrics: CycleMetrics) {
  return (
    metrics.posterPostedActual >= metrics.posterAdjustedTarget &&
    metrics.posterCompletedActual >= POSTER_NORMAL_COMPLETED_TARGET &&
    metrics.driverCompletedActual >= metrics.driverAdjustedTarget &&
    metrics.verifiedReferralsActual >= 15 &&
    metrics.completedReferralsActual >= 5
  );
}

function graceQualified(metrics: CycleMetrics) {
  return (
    metrics.posterPostedActual >= graceThreshold(metrics.posterAdjustedTarget) &&
    metrics.posterCompletedActual >= graceThreshold(POSTER_NORMAL_COMPLETED_TARGET) &&
    metrics.driverCompletedActual >= graceThreshold(metrics.driverAdjustedTarget) &&
    metrics.verifiedReferralsActual >= graceThreshold(15) &&
    metrics.completedReferralsActual >= graceThreshold(5)
  );
}

async function collectCycleMetrics(
  accountId: string,
  startAt: Date,
  endAt: Date
): Promise<CycleMetrics> {
  const window: QualificationWindow = { startAt, endAt };
  const [poster, driver, referrals] = await Promise.all([
    getPosterQualification(accountId, window),
    getDriverQualification(accountId, window),
    prisma.referral.findMany({
      where: {
        referrerId: accountId,
        createdAt: { gte: startAt, lte: endAt },
      },
      select: {
        status: true,
        verifiedAt: true,
        qualifyingJobAt: true,
        rejectedAt: true,
      },
    }),
  ]);

  const verifiedReferralsActual = referrals.filter(
    (referral) =>
      referral.status !== "rejected" &&
      referral.rejectedAt === null &&
      referral.verifiedAt !== null &&
      referral.verifiedAt <= endAt
  ).length;
  const completedReferralsActual = referrals.filter(
    (referral) =>
      referral.status === "qualified" &&
      referral.rejectedAt === null &&
      referral.verifiedAt !== null &&
      referral.verifiedAt <= endAt &&
      referral.qualifyingJobAt !== null &&
      referral.qualifyingJobAt <= endAt
  ).length;

  return {
    posterPostedActual: poster.postedJobs,
    posterCompletedActual: poster.completedJobs,
    driverCompletedActual: driver.actualCompletedJobs,
    verifiedReferralsActual,
    completedReferralsActual,
    posterAdjustedTarget: poster.adjustedPostedTarget,
    driverAdjustedTarget: driver.adjustedTarget,
    posterFairnessRatio: poster.fairnessRatio,
    driverFairnessRatio: driver.fairnessRatio,
  };
}

async function saveMetrics(cycleId: string, metrics: CycleMetrics) {
  return prisma.trialCycle.update({
    where: { id: cycleId },
    data: {
      ...metrics,
      lastEvaluatedAt: new Date(),
    },
  });
}

async function getOrCreateCycle(
  accountId: string,
  cycleNumber: number,
  trialStartedAt: Date,
  promotionEndAt: Date
) {
  // Start the next cycle after the prior cycle's actual access window.
  // If grace was used, the next cycle must not overlap that grace period.
  let startAt = trialStartedAt;
  if (cycleNumber > 0) {
    const previous = await prisma.trialCycle.findUnique({
      where: { accountId_cycleNumber: { accountId, cycleNumber: cycleNumber - 1 } },
      select: { endAt: true, graceEndsAt: true },
    });
    if (!previous) throw new Error('Previous trial cycle is missing; cannot start a later cycle safely.');
    startAt = previous.graceEndsAt ?? previous.endAt;
  }
  const endAt = minDate(addMonths(startAt, EXTENSION_MONTHS), promotionEndAt);

  return prisma.trialCycle.upsert({
    where: { accountId_cycleNumber: { accountId, cycleNumber } },
    update: {},
    create: {
      accountId,
      cycleNumber,
      startAt,
      endAt,
      status: "active",
      posterPostedTarget: POSTER_NORMAL_POSTED_TARGET,
      posterCompletedTarget: POSTER_NORMAL_COMPLETED_TARGET,
      driverCompletedTarget: DRIVER_NORMAL_TARGET,
      verifiedReferralsTarget: 15,
      completedReferralsTarget: 5,
      posterAdjustedTarget: POSTER_NORMAL_POSTED_TARGET,
      driverAdjustedTarget: DRIVER_NORMAL_TARGET,
    },
  });
}

async function markFailed(cycle: { id: string; accountId: string; cycleNumber: number; endAt: Date }, decision: string) {
  await prisma.$transaction(async (tx) => {
    await tx.trialCycle.updateMany({
      where: { id: cycle.id, status: { in: ["active", "grace"] } },
      data: { status: decision === "promotion_ended" ? "promotion_ended" : "failed", decision, decisionAt: new Date() },
    });
    await tx.account.updateMany({
      where: { id: cycle.accountId, extensionCount: cycle.cycleNumber },
      data: {
        freeEndsAt: decision === "promotion_ended" ? minDate(cycle.endAt, new Date()) : cycle.endAt,
        trialEndsAt: decision === "promotion_ended" ? minDate(cycle.endAt, new Date()) : cycle.endAt,
      },
    });
  });
}

async function grantNextCycle(
  accountId: string,
  cycle: { id: string; cycleNumber: number; endAt: Date; graceEndsAt: Date | null },
  promotionEndAt: Date
) {
  if (cycle.cycleNumber >= MAX_EXTENSIONS) {
    await prisma.trialCycle.updateMany({
      where: { id: cycle.id, status: { in: ["active", "grace"] } },
      data: { status: "max_extensions_complete", decision: "max_extensions_complete", decisionAt: new Date() },
    });
    return false;
  }

  const nextExtensionCount = cycle.cycleNumber + 1;
  const nextCycleStart = cycle.graceEndsAt ?? cycle.endAt;
  const newFreeEnd = minDate(
    addMonths(nextCycleStart, EXTENSION_MONTHS),
    promotionEndAt
  );
  const now = new Date();

  if (newFreeEnd <= now || cycle.endAt >= promotionEndAt) {
    await prisma.trialCycle.updateMany({
      where: { id: cycle.id, status: { in: ["active", "grace"] } },
      data: { status: "promotion_ended", decision: "promotion_ended", decisionAt: now },
    });
    return false;
  }

  const updated = await prisma.$transaction(async (tx) => {
    const accountUpdate = await tx.account.updateMany({
      where: { id: accountId, extensionCount: cycle.cycleNumber },
      data: {
        extensionCount: nextExtensionCount,
        freeMonthsEarned: nextExtensionCount * EXTENSION_MONTHS,
        freeEndsAt: newFreeEnd,
        trialEndsAt: newFreeEnd,
        subscriptionStatus: "promotional",
        lastActivityAt: now,
        inactiveSince: null,
      },
    });

    if (accountUpdate.count !== 1) return false;

    await tx.trialCycle.updateMany({
      where: { id: cycle.id, status: { in: ["active", "grace"] } },
      data: { status: "extended", decision: "extended", decisionAt: now },
    });
    return true;
  });

  return updated;
}

async function processCycleEnd(
  cycle: Awaited<ReturnType<typeof getOrCreateCycle>>,
  account: { id: string; trialStartedAt: Date | null; extensionCount: number },
  promotionEndAt: Date,
  promotionActive: boolean,
  now: Date
) {
  const metrics = await collectCycleMetrics(account.id, cycle.startAt, cycle.endAt);
  await saveMetrics(cycle.id, metrics);

  if (!promotionActive || now > promotionEndAt) {
    await markFailed(
      { id: cycle.id, accountId: account.id, cycleNumber: cycle.cycleNumber, endAt: cycle.endAt },
      "promotion_ended"
    );
    return;
  }

  if (fullyQualified(metrics)) {
    if (cycle.cycleNumber >= MAX_EXTENSIONS) {
      await prisma.trialCycle.update({
        where: { id: cycle.id },
        data: { status: "max_extensions_complete", decision: "max_extensions_complete", decisionAt: now },
      });
      return;
    }
    const extended = await grantNextCycle(account.id, cycle, promotionEndAt);
    if (!extended) return;
    return;
  }

  if (!graceQualified(metrics)) {
    await markFailed(
      { id: cycle.id, accountId: account.id, cycleNumber: cycle.cycleNumber, endAt: cycle.endAt },
      cycle.endAt >= promotionEndAt ? "promotion_ended" : "targets_not_met"
    );
    return;
  }

  const graceEndsAt = minDate(addDays(cycle.endAt, GRACE_DAYS), promotionEndAt);
  if (graceEndsAt <= cycle.endAt || cycle.endAt >= promotionEndAt) {
    await markFailed(
      { id: cycle.id, accountId: account.id, cycleNumber: cycle.cycleNumber, endAt: cycle.endAt },
      "promotion_ended"
    );
    return;
  }

  const changed = await prisma.$transaction(async (tx) => {
    const cycleUpdate = await tx.trialCycle.updateMany({
      where: { id: cycle.id, status: "active" },
      data: {
        status: "grace",
        graceGranted: true,
        graceStartedAt: cycle.endAt,
        graceEndsAt,
        decision: "grace_started",
        decisionAt: now,
      },
    });
    if (cycleUpdate.count !== 1) return false;

    await tx.account.updateMany({
      where: { id: account.id, extensionCount: cycle.cycleNumber },
      data: {
        freeEndsAt: graceEndsAt,
        trialEndsAt: graceEndsAt,
        subscriptionStatus: "promotional",
      },
    });
    return true;
  });

  if (!changed) return;
  if (now >= graceEndsAt) {
    await processGraceEnd(
      { ...cycle, status: "grace", graceEndsAt },
      account,
      promotionEndAt,
      promotionActive,
      now
    );
  }
}

async function processGraceEnd(
  cycle: Awaited<ReturnType<typeof getOrCreateCycle>> & { graceEndsAt: Date },
  account: { id: string; trialStartedAt: Date | null; extensionCount: number },
  promotionEndAt: Date,
  promotionActive: boolean,
  now: Date
) {
  const metrics = await collectCycleMetrics(account.id, cycle.startAt, cycle.graceEndsAt);
  await saveMetrics(cycle.id, metrics);

  if (!promotionActive || now > promotionEndAt) {
    await prisma.trialCycle.updateMany({
      where: { id: cycle.id, status: "grace" },
      data: { status: "promotion_ended", decision: "promotion_ended", decisionAt: now },
    });
    await prisma.account.updateMany({
      where: { id: account.id, extensionCount: cycle.cycleNumber },
      data: { freeEndsAt: cycle.graceEndsAt, trialEndsAt: cycle.graceEndsAt },
    });
    return;
  }

  if (fullyQualified(metrics)) {
    if (cycle.cycleNumber >= MAX_EXTENSIONS) {
      await prisma.trialCycle.updateMany({
        where: { id: cycle.id, status: "grace" },
        data: { status: "max_extensions_complete", decision: "max_extensions_complete", decisionAt: now },
      });
      return;
    }
    await grantNextCycle(account.id, cycle, promotionEndAt);
    return;
  }

  await prisma.trialCycle.updateMany({
    where: { id: cycle.id, status: "grace" },
    data: { status: "failed", decision: "targets_not_met_after_grace", decisionAt: now },
  });
  await prisma.account.updateMany({
    where: { id: account.id, extensionCount: cycle.cycleNumber },
    data: {
      freeEndsAt: cycle.graceEndsAt,
      trialEndsAt: cycle.graceEndsAt,
    },
  });
}

export async function getTrialCycleStatus(accountId: string, depth = 0): Promise<Record<string, any>> {
  if (depth > 3) {
    return { eligible: false, status: "evaluation_conflict", message: "Trial status changed concurrently. Refresh to see the latest status." };
  }

  const account = await prisma.account.findUnique({
    where: { id: accountId },
    select: {
      id: true,
      country: true,
      currency: true,
      promotionParticipant: true,
      verificationStatus: true,
      isTester: true,
      trialStartedAt: true,
      trialEndsAt: true,
      freeEndsAt: true,
      extensionCount: true,
      planType: true,
      fleetVehicleCount: true,
    },
  });

  if (
    !account ||
    !isUkAccount(account) ||
    !account.promotionParticipant ||
    !account.trialStartedAt ||
    (account.verificationStatus !== "verified" && !account.isTester)
  ) {
    return { eligible: false, status: "not_started" };
  }

  const promotion = await getPromotion();
  const now = new Date();
  const cycle = await getOrCreateCycle(
    account.id,
    account.extensionCount,
    account.trialStartedAt,
    promotion.endAt
  );

  // Repair incomplete legacy trial rows only when the stored end date is
  // missing. Never overwrite an explicit end date or resurrect an expired
  // trial just because a status endpoint was requested.
  if (
    cycle.status === "active" &&
    now < cycle.endAt &&
    account.freeEndsAt === null
  ) {
    await prisma.account.updateMany({
      where: {
        id: account.id,
        extensionCount: cycle.cycleNumber,
        promotionParticipant: true,
        freeEndsAt: null,
      },
      data: {
        freeEndsAt: cycle.endAt,
        trialEndsAt: cycle.endAt,
        subscriptionStatus: "promotional",
      },
    });
  }

  if (cycle.status === "extended") {
    return getTrialCycleStatus(accountId, depth + 1);
  }

  if (cycle.status === "active" && now >= cycle.endAt) {
    await processCycleEnd(cycle, account, promotion.endAt, promotion.active, now);
    return getTrialCycleStatus(accountId, depth + 1);
  }

  if (cycle.status === "grace") {
    const graceEndsAt = cycle.graceEndsAt;
    if (graceEndsAt && now >= graceEndsAt) {
      await processGraceEnd({ ...cycle, graceEndsAt }, account, promotion.endAt, promotion.active, now);
      return getTrialCycleStatus(accountId, depth + 1);
    }
    const metrics = await collectCycleMetrics(
      account.id,
      cycle.startAt,
      minDate(now, graceEndsAt ?? cycle.endAt)
    );
    const updated = await saveMetrics(cycle.id, metrics);
    return presentCycleStatus(updated, account, now);
  }

  if (cycle.status === "active") {
    const metrics = await collectCycleMetrics(account.id, cycle.startAt, minDate(now, cycle.endAt));
    const updated = await saveMetrics(cycle.id, metrics);
    return presentCycleStatus(updated, account, now);
  }

  return presentCycleStatus(cycle, account, now);
}

function presentCycleStatus(
  cycle: any,
  account: { extensionCount: number; freeEndsAt: Date | null; trialEndsAt: Date | null; planType: string; fleetVehicleCount: number | null },
  now: Date
) {
  const deadline = cycle.status === "grace" && cycle.graceEndsAt ? cycle.graceEndsAt : cycle.endAt;
  const daysRemaining = Math.max(0, Math.ceil((deadline.getTime() - now.getTime()) / (24 * 60 * 60 * 1000)));
  const metrics: CycleMetrics = {
    posterPostedActual: cycle.posterPostedActual,
    posterCompletedActual: cycle.posterCompletedActual,
    driverCompletedActual: cycle.driverCompletedActual,
    verifiedReferralsActual: cycle.verifiedReferralsActual,
    completedReferralsActual: cycle.completedReferralsActual,
    posterAdjustedTarget: cycle.posterAdjustedTarget,
    driverAdjustedTarget: cycle.driverAdjustedTarget,
    posterFairnessRatio: cycle.posterFairnessRatio,
    driverFairnessRatio: cycle.driverFairnessRatio,
  };
  return {
    eligible: true,
    cycleNumber: cycle.cycleNumber,
    status: cycle.status,
    startAt: cycle.startAt,
    endAt: cycle.endAt,
    graceStartedAt: cycle.graceStartedAt,
    graceEndsAt: cycle.graceEndsAt,
    daysRemaining,
    maxExtensions: MAX_EXTENSIONS,
    extensionsUsed: account.extensionCount,
    planType: account.planType,
    fleetVehicleCount: account.fleetVehicleCount,
    freeEndsAt: account.freeEndsAt,
    trialEndsAt: account.trialEndsAt,
    targets: {
      posterPosted: POSTER_NORMAL_POSTED_TARGET,
      posterPostedAdjusted: cycle.posterAdjustedTarget,
      posterCompleted: POSTER_NORMAL_COMPLETED_TARGET,
      driverCompleted: DRIVER_NORMAL_TARGET,
      driverCompletedAdjusted: cycle.driverAdjustedTarget,
      verifiedReferrals: 15,
      completedReferrals: 5,
      graceThresholds: {
        posterPosted: graceThreshold(cycle.posterAdjustedTarget),
        posterCompleted: graceThreshold(POSTER_NORMAL_COMPLETED_TARGET),
        driverCompleted: graceThreshold(cycle.driverAdjustedTarget),
        verifiedReferrals: graceThreshold(15),
        completedReferrals: graceThreshold(5),
      },
    },
    actual: {
      posterPosted: cycle.posterPostedActual,
      posterCompleted: cycle.posterCompletedActual,
      driverCompleted: cycle.driverCompletedActual,
      verifiedReferrals: cycle.verifiedReferralsActual,
      completedReferrals: cycle.completedReferralsActual,
    },
    qualified: fullyQualified(metrics),
    graceEligible: graceQualified(metrics),
    graceGranted: cycle.graceGranted,
    decision: cycle.decision,
  };
}
