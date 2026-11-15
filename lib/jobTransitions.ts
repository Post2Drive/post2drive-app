import type { JobStatus } from "@/lib/jobState";

/**
 * The only legal job status moves. Every route that writes `Job.status` must
 * use one of these edges. scripts/qa/job-transitions-contract.mjs reads each
 * write site's guard and target and checks them against this table; routes
 * whose guard comes from an earlier read also call `canTransition` before the
 * update.
 */
export const JOB_TRANSITIONS: Readonly<Record<JobStatus, readonly JobStatus[]>> = {
  open: ["accepted", "cancelled"],
  accepted: ["in_transit", "open", "cancelled"],
  in_transit: ["delivered", "cancelled", "disputed"],
  // Delivery history is never erased: a delivered job is confirmed, or returned to
  // in_transit when the poster rejects delivery. Problems after delivery go through
  // the dispute and incident workflow, not cancellation.
  delivered: ["completed", "in_transit", "disputed"],
  // Under review by an administrator. Only an admin resolution leaves this state.
  disputed: ["completed", "cancelled", "in_transit"],
  completed: [],
  cancelled: [],
};

export function canTransition(from: JobStatus, to: JobStatus): boolean {
  return JOB_TRANSITIONS[from].includes(to);
}

export function assertTransition(from: JobStatus, to: JobStatus): void {
  if (!canTransition(from, to)) {
    throw new Error(`Illegal job transition: ${from} -> ${to}`);
  }
}
