// Fair rating policy contract: exercises every rule in lib/ratingPolicy.ts and
// checks the API, profile and UI are wired to it.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
const p = await import(new URL("../../lib/ratingPolicy.ts", import.meta.url));

const H = 3600e3, D = 24 * H;
const t0 = new Date("2026-11-01T10:00:00Z");
const at = (ms) => new Date(t0.getTime() + ms);
const elig = (facts, now) => p.ratingEligibility(facts, now);

// Constants agreed with the owner.
assert.equal(p.AUTO_CONFIRM_HOURS, 72);
assert.equal(p.RATING_WINDOW_DAYS, 14);

// 1. Completed: opens at confirmation, closes 14 days later.
let r = elig({ status: "completed", pickupConfirmedAt: t0, deliveryMarkedAt: at(H), deliveryConfirmedAt: at(2 * H) }, at(3 * H));
assert.equal(r.allowed, true); assert.equal(r.outcome, "completed");
assert.equal(r.closesAt.getTime(), at(2 * H + 14 * D).getTime());
r = elig({ status: "completed", deliveryConfirmedAt: t0 }, at(14 * D + 1));
assert.equal(r.allowed, false); assert.equal(r.code, "window_closed");

// 2. Delivered, poster silent: closed until 72h, then opens as completed.
r = elig({ status: "delivered", pickupConfirmedAt: t0, deliveryMarkedAt: t0 }, at(71 * H));
assert.equal(r.allowed, false); assert.equal(r.code, "not_yet_open");
r = elig({ status: "delivered", pickupConfirmedAt: t0, deliveryMarkedAt: t0 }, at(72 * H));
assert.equal(r.allowed, true); assert.equal(r.outcome, "completed");

// 3. Never picked up (accepted or cancelled before pickup): no stars.
for (const status of ["open", "accepted", "cancelled"]) {
  r = elig({ status, cancelledAt: t0 }, at(D));
  assert.equal(r.allowed, false, status); assert.equal(r.code, "not_picked_up", status);
}

// 4. Picked up, delivery rejected, not completed: disputed after 14 days.
r = elig({ status: "in_transit", pickupConfirmedAt: t0, latestDeliveryRejectedAt: at(D) }, at(14 * D));
assert.equal(r.allowed, false);
r = elig({ status: "in_transit", pickupConfirmedAt: t0, latestDeliveryRejectedAt: at(D) }, at(15 * D));
assert.equal(r.allowed, true); assert.equal(r.outcome, "disputed");

// 5. Picked up, incident reported: not completed after 72h cool-off.
r = elig({ status: "in_transit", pickupConfirmedAt: t0, firstIncidentReportedAt: at(D) }, at(D + 71 * H));
assert.equal(r.allowed, false);
r = elig({ status: "in_transit", pickupConfirmedAt: t0, firstIncidentReportedAt: at(D) }, at(D + 72 * H));
assert.equal(r.allowed, true); assert.equal(r.outcome, "not_completed");

// 6. Picked up then cancelled: not completed, opens at cancellation.
r = elig({ status: "cancelled", pickupConfirmedAt: t0, cancelledAt: at(H) }, at(2 * H));
assert.equal(r.allowed, true); assert.equal(r.outcome, "not_completed");

// 7. Stuck in transit 14 days: not completed.
r = elig({ status: "in_transit", pickupConfirmedAt: t0 }, at(13 * D));
assert.equal(r.allowed, false);
r = elig({ status: "in_transit", pickupConfirmedAt: t0 }, at(14 * D));
assert.equal(r.allowed, true); assert.equal(r.outcome, "not_completed");

// 8. Delivered but rejected earlier and incident: rejection wins (disputed) until 72h auto-confirm.
r = elig({ status: "delivered", pickupConfirmedAt: t0, deliveryMarkedAt: at(20 * D), latestDeliveryRejectedAt: at(D) }, at(20 * D + H));
assert.equal(r.allowed, true); assert.equal(r.outcome, "disputed");

// 9. Reasons.
assert.equal(p.ratingReasonRequired(5, "completed"), false);
assert.equal(p.ratingReasonRequired(3, "completed"), false);
assert.equal(p.ratingReasonRequired(2, "completed"), true);
assert.equal(p.ratingReasonRequired(5, "not_completed"), true);
assert.equal(p.ratingReasonRequired(5, "disputed"), true);
assert.equal(p.isRatingReasonCode("late"), true);
assert.equal(p.isRatingReasonCode("toString"), false);
assert.equal(p.isRatingReasonCode("made-up"), false);

// 10. Blind visibility.
const closesAt = at(14 * D);
assert.equal(p.initialVisibleAfter({ closesAt }, false, t0).getTime(), closesAt.getTime());
assert.equal(p.initialVisibleAfter({ closesAt }, true, t0).getTime(), t0.getTime());

// Wiring.
const route = read("app/api/ratings/route.ts");
assert.match(route, /ratingEligibility\(/, "API must use the shared policy");
assert.match(route, /ratingReasonRequired\(/, "API must enforce required reasons");
assert.match(route, /initialVisibleAfter\(/, "API must set blind visibility");
assert.match(route, /visibleAfter: now/, "second rating must reveal the first");
assert.doesNotMatch(route, /DRIVER_BACKED_OUT/, "drivers who backed out before pickup must not be rateable");
assert.doesNotMatch(route, /rateableStatuses/, "old status-only gate must be gone");
const profile = read("app/api/profile/[id]/route.ts");
assert.match(profile, /visibleAfter: \{ lte: now \}/, "profile must hide blind ratings");
assert.match(profile, /outcome: "completed"/, "average must count completed jobs only");
const schema = read("prisma/schema.prisma");
for (const field of ["outcome", "reasonCode", "visibleAfter"]) assert.match(schema, new RegExp(`\\b${field}\\b`), `Rating.${field} missing`);
assert.match(read("app/jobs/page.tsx"), /RATING_REASONS/, "rating form must offer reasons");

console.log("Fair ratings contract passed: eligibility windows, outcomes, reasons, blind visibility and wiring.");
