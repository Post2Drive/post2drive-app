import { prisma } from "@/lib/prisma";
import { INDIVIDUAL_PRICE_GBP } from "@/lib/pricing";
import { isUkAccount } from "@/lib/uk";

export async function recordAcceptedJobUsage(
  accountId: string,
  jobId: string
) {
  const account =
    await prisma.account.findUnique({
      where: {
        id: accountId,
      },
    });

  if (
    !account ||
    !isUkAccount(account)
  ) {
    return null;
  }

  /*
   * All UK plans now have unlimited legitimate
   * marketplace activity with no per-job charges.
   *
   * We still record accepted-job events so they
   * remain available for activity, reporting and
   * promotion calculations.
   */
  return prisma.platformUsageEvent.upsert({
    where: {
      accountId_eventKey: {
        accountId,
        eventKey:
          `job_accepted:${jobId}`,
      },
    },

    create: {
      accountId,

      eventType:
        "job_accepted",

      eventKey:
        `job_accepted:${jobId}`,

      metadata: {
        jobId,
      },
    },

    update: {},
  });
}

/*
 * Kept for compatibility with existing callers.
 * Accepted jobs are no longer used to calculate
 * additional charges under the new weekly pricing.
 */
export async function getCurrentMonthAcceptedJobs(
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
    return 0;
  }

  return prisma.platformUsageEvent.count({
    where: {
      accountId,

      eventType:
        "job_accepted",

      createdAt: {
        gte: new Date(
          new Date().getFullYear(),
          new Date().getMonth(),
          1
        ),
      },
    },
  });
}

/*
 * Kept for compatibility with existing dashboard
 * or API callers.
 *
 * The returned price is now the flat individual
 * weekly access price. Accepted-job volume does
 * not increase the price.
 */
export async function getCurrentMonthIndividualPrice(
  accountId: string
) {
  const jobs =
    await getCurrentMonthAcceptedJobs(
      accountId
    );

  return {
    acceptedJobs:
      jobs,

    includedJobs:
      null,

    extraJobs:
      0,

    priceGbp:
      INDIVIDUAL_PRICE_GBP,

    monthlyCapGbp:
      null,
  };
}