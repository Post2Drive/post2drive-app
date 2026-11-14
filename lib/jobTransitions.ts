import type { JobStatus } from "@/lib/jobState";

/**
 * The only legal job status moves. Every route that writes `Job.status` must
 * use one of these edges; scripts/qa/job-transitions-contract.mjs checks that
 * each write site's declared from-state is listed here.
 */
export const JOB_TRANSITIONS: Readonly<Record<JobStatus, readonly JobStatus[]>> = {
  open: ["accepted", "cancelled"],
  accepted: ["in_transit", "open", "cancelled"],
  in_transit: ["delivered", "cancelled"],
  delivered: ["completed", "in_transit", "cancelled"],
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
