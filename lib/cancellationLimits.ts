import { prisma } from "@/lib/prisma";

// Deliberately generous placeholder limits — not tuned yet. The plan is to
// watch real cancellation patterns during the free-trial/testing period and
// set real thresholds once there's actual data, rather than guessing now.
// Keeping the numbers here in one place (not scattered through route logic)
// so they're easy to adjust without hunting through the codebase.
export const CANCELLATION_LIMIT_PER_WEEK = 5;
export const CANCELLATION_LIMIT_PER_MONTH = 15;

// Returns true if this account should be temporarily blocked from
// cancelling/unassigning again. Counts both full cancels and unassigns
// initiated by this account (cancelledById), not cancellations done *to*
// them by someone else.
export async function isCancellationRestricted(accountId: string): Promise<boolean> {
  const now = new Date();
  const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const monthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  const [weekJobs, monthJobs] = await Promise.all([
    prisma.job.findMany({
      where: { cancelledById: accountId, cancelledAt: { gte: weekAgo } },
      select: { id: true },
    }),
    prisma.job.findMany({
      where: { cancelledById: accountId, cancelledAt: { gte: monthAgo } },
      select: { id: true },
    }),
  ]);

  const allJobIds = [...new Set([...weekJobs, ...monthJobs].map((job) => job.id))];
  const incidentTerminations = allJobIds.length
    ? await prisma.jobActivity.findMany({
        where: { jobId: { in: allJobIds }, action: "JOB_TERMINATED_WITH_INCIDENT" },
        select: { jobId: true },
      })
    : [];
  const incidentTerminatedJobIds = new Set(incidentTerminations.map((event) => event.jobId));

  // Safety incident terminations remain auditable but do not consume the
  // ordinary cancellation/unassignment allowance. Repeated incidents can
  // still be reviewed by support; they must not trap emergencies.
  const weekCount = weekJobs.filter((job) => !incidentTerminatedJobIds.has(job.id)).length;
  const monthCount = monthJobs.filter((job) => !incidentTerminatedJobIds.has(job.id)).length;

  return weekCount >= CANCELLATION_LIMIT_PER_WEEK || monthCount >= CANCELLATION_LIMIT_PER_MONTH;
}