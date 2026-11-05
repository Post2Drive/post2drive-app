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

// Constants agreed with the owner. Nothing auto-confirms.
assert.equal(p.RATING_WINDOW_DAYS, 14);
assert.equal(p.UNCONFIRMED_DELIVERY_DAYS, 14);
assert.equal(p.AUTO_CONFIRM_HOURS, undefined, "no automatic confirmation: delivery needs both sides");

// 1. Completed: opens at confirmation, closes 14 days later.
let r = elig({ status: "completed", pickupConfirmedAt: t0, deliveryMarkedAt: at(H), deliveryConfirmedAt: at(2 * H) }, at(3 * H));
assert.equal(r.allowed, true); assert.equal(r.outcome, "completed");
assert.equal(r.closesAt.getTime(), at(2 * H + 14 * D).getTime());
r = elig({ status: "completed", deliveryConfirmedAt: t0 }, at(14 * D + 1));
assert.equal(r.allowed, false); assert.equal(r.code, "window_closed");

// 2. Marked delivered, never confirmed by the other side: closed for 14 days, then disputed.
r = elig({ status: "delivered", pickupConfirmedAt: t0, deliveryMarkedAt: t0 }, at(72 * H));
assert.equal(r.allowed, false); assert.equal(r.code, "not_yet_open");
r = elig({ status: "delivered", pickupConfirmedAt: t0, deliveryMarkedAt: t0 }, at(14 * D));
assert.equal(r.allowed, true); assert.equal(r.outcome, "disputed");

// 3. Never picked up (open, accepted, cancelled or ended before pickup): no stars.
for (const status of ["open", "accepted", "cancelled"]) {
  r = elig({ status, cancelledAt: t0 }, at(D));
  assert.equal(r.allowed, false, status); assert.equal(r.code, "not_picked_up", status);
}

// 4. Picked up, then ended through the incident process: not completed, opens when it ended.
r = elig({ status: "cancelled", pickupConfirmedAt: t0, cancelledAt: at(H) }, at(2 * H));
assert.equal(r.allowed, true); assert.equal(r.outcome, "not_completed");

// 5. Live jobs are never rateable, however long they run (incl. after a rejected delivery).
for (const later of [D, 30 * D, 365 * D]) {
  r = elig({ status: "in_transit", pickupConfirmedAt: t0 }, at(later));
  assert.equal(r.allowed, false); assert.equal(r.code, "in_progress");
}

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
const jobsPage = read("app/jobs/page.tsx");
assert.match(jobsPage, /RATING_REASONS/, "rating form must offer reasons");
assert.doesNotMatch(jobsPage, /currentUserPreviouslyBackedOut\);/, "backed-out drivers must not see the rating form");

console.log("Fair ratings contract passed: eligibility windows, outcomes, reasons, blind visibility and wiring.");
