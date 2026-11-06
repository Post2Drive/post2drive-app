import { prisma } from "@/lib/prisma";
import {
  CANCELLATION_WINDOW_MONTH_DAYS,
  SELF_INITIATED_CANCELLATION_ACTIONS,
  cancellationWindowStart,
  countSelfInitiatedCancellations,
  exceedsCancellationLimits,
} from "@/lib/cancellationPolicy";

// Thresholds live in lib/cancellationPolicy.ts; re-exported for existing imports.
export { CANCELLATION_LIMIT_PER_WEEK, CANCELLATION_LIMIT_PER_MONTH } from "@/lib/cancellationPolicy";

// Returns true if this account should be temporarily blocked from
// cancelling/unassigning again. Counts the append-only JobActivity history of
// cancels, back-outs and unassigns initiated by this account — not
// Job.cancelledById, which a later cancellation on the same job overwrites.
// Safety incident terminations remain auditable but do not consume the
// ordinary cancellation/unassignment allowance; they are excluded by the
// action allowlist.
export async function isCancellationRestricted(accountId: string): Promise<boolean> {
  const now = new Date();
  // Served by the JobActivity (actorId, action, createdAt) index.
  const rows = await prisma.jobActivity.findMany({
    where: {
      actorId: accountId,
      action: { in: [...SELF_INITIATED_CANCELLATION_ACTIONS] },
      createdAt: { gte: cancellationWindowStart(now, CANCELLATION_WINDOW_MONTH_DAYS) },
    },
    select: { actorId: true, action: true, createdAt: true },
  });

  return exceedsCancellationLimits(countSelfInitiatedCancellations(rows, accountId, now));
}
