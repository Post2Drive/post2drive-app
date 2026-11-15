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

/** Plain wording for each reason, shown to the people involved. */
export const DISPUTE_REASON_LABELS: Readonly<Record<DisputeReason, string>> = {
  goods_damaged: "The goods were damaged",
  not_delivered: "The goods were not delivered",
  wrong_or_missing_items: "Items are wrong or missing",
  conduct: "Behaviour or conduct",
  delivery_confirmation: "We disagree about whether it was delivered",
  other: "Something else",
};

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
