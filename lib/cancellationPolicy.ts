// Cancellation-limit policy: thresholds and counting rules, kept free of
// database imports so they can be adjusted and unit-tested in one place.

// Deliberately generous placeholder limits — not tuned yet. The plan is to
// watch real cancellation patterns during the free-trial/testing period and
// set real thresholds once there's actual data, rather than guessing now.
export const CANCELLATION_LIMIT_PER_WEEK = 5;
export const CANCELLATION_LIMIT_PER_MONTH = 15;
export const CANCELLATION_WINDOW_WEEK_DAYS = 7;
export const CANCELLATION_WINDOW_MONTH_DAYS = 30;

// JobActivity actions that an account initiates itself and that consume its
// ordinary cancellation/unassignment allowance. JOB_TERMINATED_WITH_INCIDENT
// (user or support terminations) is intentionally absent: safety incidents
// stay auditable but must not trap emergencies.
export const SELF_INITIATED_CANCELLATION_ACTIONS = [
  "JOB_CANCELLED", // poster cancels the job
  "DRIVER_BACKED_OUT", // driver withdraws before pickup
  "DRIVER_UNASSIGNED", // poster removes the assigned driver
] as const;

const DAY_MS = 24 * 60 * 60 * 1000;

export function cancellationWindowStart(now: Date, days: number): Date {
  return new Date(now.getTime() - days * DAY_MS);
}

export type CancellationActivityRow = {
  actorId: string | null;
  action: string;
  createdAt: Date;
};

export type CancellationCounts = { week: number; month: number };

// Counts every self-initiated cancellation event by this account. Each event
// counts, so a later event on the same job never erases an earlier one.
export function countSelfInitiatedCancellations(
  rows: readonly CancellationActivityRow[],
  accountId: string,
  now: Date,
): CancellationCounts {
  const weekStart = cancellationWindowStart(now, CANCELLATION_WINDOW_WEEK_DAYS).getTime();
  const monthStart = cancellationWindowStart(now, CANCELLATION_WINDOW_MONTH_DAYS).getTime();
  const counted: readonly string[] = SELF_INITIATED_CANCELLATION_ACTIONS;
  let week = 0;
  let month = 0;
  for (const row of rows) {
    if (row.actorId !== accountId || !counted.includes(row.action)) continue;
    const at = row.createdAt.getTime();
    if (at >= monthStart) month += 1;
    if (at >= weekStart) week += 1;
  }
  return { week, month };
}

export function exceedsCancellationLimits(counts: CancellationCounts): boolean {
  return counts.week >= CANCELLATION_LIMIT_PER_WEEK || counts.month >= CANCELLATION_LIMIT_PER_MONTH;
}
