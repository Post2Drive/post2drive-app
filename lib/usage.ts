import { prisma } from "@/lib/prisma";
import { getIndividualWeeklyPrice, isWeeklyPricingEligible } from "@/lib/pricing";

export async function recordAcceptedJobUsage(accountId: string, jobId: string) {
  const account = await prisma.account.findUnique({ where: { id: accountId } });
  if (!account || !isWeeklyPricingEligible(account)) return null;

  // Weekly UK/EUR plans allow unlimited legitimate marketplace activity with no per-job charges.
  return prisma.platformUsageEvent.upsert({
    where: { accountId_eventKey: { accountId, eventKey: `job_accepted:${jobId}` } },
    create: {
      accountId,
      eventType: "job_accepted",
      eventKey: `job_accepted:${jobId}`,
      metadata: { jobId },
    },
    update: {},
  });
}

/** Compatibility helper for reporting; job volume does not change weekly plan prices. */
export async function getCurrentMonthAcceptedJobs(accountId: string) {
  const account = await prisma.account.findUnique({
    where: { id: accountId },
    select: { country: true, currency: true },
  });
  if (!account || !isWeeklyPricingEligible(account)) return 0;

  return prisma.platformUsageEvent.count({
    where: {
      accountId,
      eventType: "job_accepted",
      createdAt: { gte: new Date(new Date().getFullYear(), new Date().getMonth(), 1) },
    },
  });
}

/** Compatibility helper: exposes price in its market currency, with the legacy GBP field retained. */
export async function getCurrentMonthIndividualPrice(accountId: string) {
  const acceptedJobs = await getCurrentMonthAcceptedJobs(accountId);
  const account = await prisma.account.findUnique({
    where: { id: accountId },
    select: { country: true, currency: true },
  });
  const price = account ? getIndividualWeeklyPrice(account) : null;
  return {
    acceptedJobs,
    includedJobs: null,
    extraJobs: 0,
    price,
    currency: account?.currency ?? null,
    priceGbp: account?.currency === "GBP" ? price : null,
    monthlyCapGbp: null,
  };
}
