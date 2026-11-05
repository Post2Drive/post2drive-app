/*
 * Fair rating policy (owner decision 2026-11-06). Pure functions only, so the
 * rules are testable without a database. See docs/PRODUCT_AND_VERIFICATION_POLICY.md §11.
 *
 * Who can rate: only the poster and the currently assigned driver of a job.
 * When:
 *  - completed (delivery confirmed)               -> "completed", opens at confirmation
 *  - marked delivered, never confirmed by the other side -> "disputed", opens 14 days after the mark
 *    (nothing changes job status automatically: delivery needs both sides)
 *  - picked up, delivery rejected, not completed  -> "disputed", opens 14 days after the latest rejection
 *  - picked up, incident reported, not completed  -> "not_completed", opens 72h after the incident report
 *  - picked up, then cancelled                    -> "not_completed", opens at cancellation
 *  - picked up, stuck in transit for 14 days      -> "not_completed", opens 14 days after pickup
 *  - never picked up (incl. cancelled before pickup) -> no stars; counts in the cancellation record instead
 * Window: rating closes 14 days after it opens.
 * Blind: a rating stays hidden until the other side also rates, or the window closes.
 * Reasons: required for 1-2 stars and for every not_completed / disputed rating.
 */

/** A delivery marked by one side but not confirmed by the other for this long can be rated as disputed. Job status is never changed automatically. */
export const UNCONFIRMED_DELIVERY_DAYS = 14;
export const RATING_WINDOW_DAYS = 14;
export const DISPUTE_SETTLE_DAYS = 14;
export const STUCK_IN_TRANSIT_DAYS = 14;
export const INCIDENT_COOL_OFF_HOURS = 72;

const HOUR = 60 * 60 * 1000;
const DAY = 24 * HOUR;

export type RatingOutcome = "completed" | "not_completed" | "disputed";

export const RATING_REASONS = {
  late: "Late pickup or delivery",
  no_show: "Did not turn up",
  damage: "Goods damaged or lost",
  wrong_goods: "Goods or job not as described",
  vehicle_unsuitable: "Vehicle not suitable",
  poor_communication: "Poor communication",
  unsafe_or_rude: "Unsafe or rude behaviour",
  payment_issue: "Payment problem",
  other: "Other (explain in comment)",
} as const;

export type RatingReasonCode = keyof typeof RATING_REASONS;

export function isRatingReasonCode(value: unknown): value is RatingReasonCode {
  return typeof value === "string" && Object.prototype.hasOwnProperty.call(RATING_REASONS, value);
}

export type JobRatingFacts = {
  status: string;
  cancelledAt?: Date | null;
  pickupConfirmedAt?: Date | null;
  deliveryMarkedAt?: Date | null;
  deliveryConfirmedAt?: Date | null;
  latestDeliveryRejectedAt?: Date | null;
  firstIncidentReportedAt?: Date | null;
};

export type RatingEligibility =
  | { allowed: true; outcome: RatingOutcome; opensAt: Date | null; closesAt: Date | null }
  | { allowed: false; code: "not_picked_up" | "not_yet_open" | "window_closed"; message: string; opensAt?: Date };

const add = (date: Date, ms: number) => new Date(date.getTime() + ms);

function windowFor(outcome: RatingOutcome, opensAt: Date | null, now: Date): RatingEligibility {
  if (opensAt && now < opensAt) {
    return { allowed: false, code: "not_yet_open", opensAt, message: `Rating opens on ${opensAt.toISOString()}.` };
  }
  const closesAt = opensAt ? add(opensAt, RATING_WINDOW_DAYS * DAY) : null;
  if (closesAt && now > closesAt) {
    return { allowed: false, code: "window_closed", message: `The ${RATING_WINDOW_DAYS}-day rating window for this job has closed.` };
  }
  return { allowed: true, outcome, opensAt, closesAt };
}

export function ratingEligibility(job: JobRatingFacts, now: Date = new Date()): RatingEligibility {
  if (job.status === "completed") {
    // Legacy jobs may predate the confirmation activity; fall back to the delivery mark.
    return windowFor("completed", job.deliveryConfirmedAt ?? job.deliveryMarkedAt ?? null, now);
  }

  if (job.status === "delivered" && job.deliveryMarkedAt) {
    // Delivery must be confirmed by both sides; the job is never completed automatically.
    // If the other side never confirms, both may rate after 14 days, labelled disputed.
    return windowFor("disputed", add(job.deliveryMarkedAt, UNCONFIRMED_DELIVERY_DAYS * DAY), now);
  }

  if (!job.pickupConfirmedAt) {
    return {
      allowed: false, code: "not_picked_up",
      message: "Jobs that never reached pickup cannot be rated. Cancellations count in the cancellation record instead.",
    };
  }

  if (job.latestDeliveryRejectedAt) {
    return windowFor("disputed", add(job.latestDeliveryRejectedAt, DISPUTE_SETTLE_DAYS * DAY), now);
  }
  if (job.firstIncidentReportedAt) {
    return windowFor("not_completed", add(job.firstIncidentReportedAt, INCIDENT_COOL_OFF_HOURS * HOUR), now);
  }
  if (job.status === "cancelled") {
    return windowFor("not_completed", job.cancelledAt ?? null, now);
  }
  return windowFor("not_completed", add(job.pickupConfirmedAt, STUCK_IN_TRANSIT_DAYS * DAY), now);
}

/** A reason is required for low ratings and for every rating of a job that did not complete normally. */
export function ratingReasonRequired(stars: number, outcome: RatingOutcome) {
  return stars <= 2 || outcome !== "completed";
}

/** Blind-rating visibility: hidden until the window closes, unless the other side has already rated. */
export function initialVisibleAfter(eligibility: { closesAt: Date | null }, counterpartAlreadyRated: boolean, now: Date = new Date()) {
  if (counterpartAlreadyRated) return now;
  return eligibility.closesAt ?? add(now, RATING_WINDOW_DAYS * DAY);
}
