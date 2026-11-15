import type { JobStatus } from "@/lib/jobState";

/** Why a poster or driver opened a dispute. Stored on the DISPUTE_OPENED activity. */
export const DISPUTE_REASONS = [
  "goods_damaged",
  "not_delivered",
  "wrong_or_missing_items",
  "conduct",
  "delivery_confirmation",
  "other",
] as const;
export type DisputeReason = (typeof DISPUTE_REASONS)[number];

export function isDisputeReason(value: unknown): value is DisputeReason {
  return typeof value === "string" && (DISPUTE_REASONS as readonly string[]).includes(value);
}

/**
 * What an administrator can decide. `fault` is recorded for the record only:
 * the trust spec makes no automatic penalty. Conduct that warrants suspension
 * is handled separately through the existing suspension tools.
 */
export const DISPUTE_OUTCOMES: Readonly<Record<string, { to: JobStatus; fault: "none" | "driver" | "poster"; label: string }>> = {
  completed: { to: "completed", fault: "none", label: "Delivery confirmed as complete" },
  return_to_transit: { to: "in_transit", fault: "none", label: "Returned to in transit; the driver must mark delivery again" },
  cancelled_no_fault: { to: "cancelled", fault: "none", label: "Cancelled with no fault found" },
  cancelled_driver_fault: { to: "cancelled", fault: "driver", label: "Cancelled; the driver was at fault" },
  cancelled_poster_fault: { to: "cancelled", fault: "poster", label: "Cancelled; the poster was at fault" },
};

export function isDisputeOutcome(value: unknown): value is keyof typeof DISPUTE_OUTCOMES {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(DISPUTE_OUTCOMES, value);
}
