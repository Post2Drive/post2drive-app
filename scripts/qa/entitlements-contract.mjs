#!/usr/bin/env node
// Entitlements and launch windows contract (EXECUTION_PLAN §3–§4, owner decisions 2026-11-06).
// Exercises the pure rules in lib/launchWindows.ts at every date boundary, then checks that the
// app wires them in (POST vs DRIVE callers, no hard-coded window dates, fail-closed config).
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { register } from "node:module";

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
const root = new URL("../../", import.meta.url).href;
register(`data:text/javascript,${encodeURIComponent(`
  export async function resolve(specifier, context, next) {
    if (specifier.startsWith("@/")) return next(${JSON.stringify(root)} + specifier.slice(2) + ".ts", context);
    return next(specifier, context);
  }`)}`);
const lw = await import(new URL("../../lib/launchWindows.ts", import.meta.url));
const pricing = await import(new URL("../../lib/pricing.ts", import.meta.url));

const d = (iso) => new Date(iso);
const DAY = 86400000;
const plus = (date, days) => new Date(date.getTime() + days * DAY);
const before = (date) => new Date(date.getTime() - 1);

const configRow = {
  posterWindowStart: d("2027-01-01T00:00:00Z"),
  posterWindowEnd: d("2028-01-01T00:00:00Z"),
  driverWindowStart: d("2027-01-01T00:00:00Z"),
  driverWindowEnd: d("2027-04-01T00:00:00Z"),
  newPosterTrialDays: 30,
  driverWaitlistRatio: 1.0,
};
const checked = lw.checkLaunchConfig(configRow);
assert.equal(checked.status, "ok");
const C = checked.config;

// ---------- 1. Config: fails closed, never invents dates ----------
assert.equal(lw.checkLaunchConfig(null).status, "missing", "missing row must be reported, not defaulted");
assert.equal(lw.checkLaunchConfig(undefined).config, null);
assert.equal(lw.checkLaunchConfig({ ...configRow, posterWindowEnd: null }).status, "invalid");
assert.equal(lw.checkLaunchConfig({ ...configRow, posterWindowEnd: configRow.posterWindowStart }).status, "invalid");
assert.equal(lw.checkLaunchConfig({ ...configRow, driverWindowStart: before(configRow.posterWindowStart) }).status, "invalid", "driver window cannot open in Month 0");
assert.equal(lw.checkLaunchConfig({ ...configRow, driverWindowEnd: plus(configRow.posterWindowEnd, 1) }).status, "invalid");
assert.equal(lw.checkLaunchConfig({ ...configRow, newPosterTrialDays: 1.5 }).status, "invalid");
assert.equal(lw.checkLaunchConfig({ ...configRow, driverWaitlistRatio: -1 }).status, "invalid");
assert.equal(lw.checkLaunchConfig({ ...configRow, driverWindowStart: d("2027-02-01T00:00:00Z") }).status, "ok", "driver window may start later than poster window");

// ---------- 2. Phases ----------
assert.equal(lw.launchPhase(null, d("2027-06-01T00:00:00Z")), "unconfigured");
assert.equal(lw.launchPhase(C, before(C.posterWindowStart)), "month_0");
assert.equal(lw.launchPhase(C, C.posterWindowStart), "poster_window");
assert.equal(lw.launchPhase(C, before(C.posterWindowEnd)), "poster_window");
assert.equal(lw.launchPhase(C, C.posterWindowEnd), "after_poster_window");
assert.equal(lw.isInDriverWindow(C, before(C.driverWindowStart)), false);
assert.equal(lw.isInDriverWindow(C, C.driverWindowStart), true);
assert.equal(lw.isInDriverWindow(C, before(C.driverWindowEnd)), true);
assert.equal(lw.isInDriverWindow(C, C.driverWindowEnd), false);

// ---------- Facts helper ----------
const base = {
  market: "weekly", phoneVerified: true, verified: true, pilotFreeEndsAt: null, drivePlanKey: "individual",
  firstJobPostedAt: null, firstVehicleApprovedAt: null, vehicleEligibleUntil: null, operatingRegion: "LS",
  driverAdmittedAt: null, waitlist: null, paid: null, switchToPosterRequestedAt: null, paidPosterPeriods: [],
};
const facts = (extra) => ({ ...base, ...extra });
const post = (f, now, config = C) => lw.computePostEntitlement(f, config, now);
const drive = (f, now, config = C) => lw.computeDriveEntitlement(f, config, now);

// ---------- 3. Month 0 ----------
{
  const now = before(C.posterWindowStart);
  const p = post(facts({}), now);
  assert.equal(p.allowed, false); assert.equal(p.reason, "month_0");
  assert.equal(p.opensAt.toISOString(), C.posterWindowStart.toISOString(), "Month 0 must tell posters the window start date");
  const dr = drive(facts({ firstVehicleApprovedAt: plus(now, -2), vehicleEligibleUntil: plus(now, 300), driverAdmittedAt: plus(now, -1) }), now);
  assert.equal(dr.allowed, false); assert.equal(dr.reason, "month_0", "no bidding/accepting in Month 0");
  // Even a paid record cannot open the marketplace before launch.
  assert.equal(post(facts({ paid: { planKey: "poster", endsAt: plus(now, 30) } }), now).reason, "month_0");
  // Verification itself is not gated here (unverified gets verification_required, not month_0, only after verified check order):
  assert.equal(post(facts({ verified: false }), now).reason, "verification_required");
}

// ---------- 4. Poster window ----------
{
  const now = C.posterWindowStart;
  const p = post(facts({}), now);
  assert.equal(p.allowed, true); assert.equal(p.reason, "poster_window");
  assert.equal(p.endsAt.toISOString(), C.posterWindowEnd.toISOString(), "posting is free until posterWindowEnd");
  const late = post(facts({ firstJobPostedAt: plus(C.posterWindowStart, 100) }), before(C.posterWindowEnd));
  assert.equal(late.reason, "poster_window");
  // Window joiners pay from posterWindowEnd (no extra trial).
  const after = post(facts({ firstJobPostedAt: plus(C.posterWindowStart, 100) }), C.posterWindowEnd);
  assert.equal(after.allowed, false); assert.equal(after.reason, "access_expired");
  assert.equal(lw.posterChargeableFrom(C, plus(C.posterWindowStart, 100)).toISOString(), C.posterWindowEnd.toISOString());
  // A verified-but-unused account in the window is not charged.
  assert.equal(lw.posterChargeableFrom(C, null), null, "nothing is charged while verified but unused");
}

// ---------- 5. New poster after the window: 1-month (30-day) trial from first post ----------
{
  const firstPost = plus(C.posterWindowEnd, 10);
  const p = post(facts({}), firstPost);
  assert.equal(p.allowed, true); assert.equal(p.reason, "new_poster_trial");
  assert.equal(p.endsAt.toISOString(), plus(firstPost, 30).toISOString(), "a brand-new poster gets newPosterTrialDays from now");
  const withPost = facts({ firstJobPostedAt: firstPost });
  assert.equal(post(withPost, before(plus(firstPost, 30))).reason, "new_poster_trial");
  assert.equal(post(withPost, plus(firstPost, 30)).allowed, false, "trial ends exactly at +30 days");
  assert.equal(lw.posterChargeableFrom(C, firstPost).toISOString(), plus(firstPost, 30).toISOString());
  const paid = post(facts({ firstJobPostedAt: firstPost, paid: { planKey: "poster", endsAt: plus(firstPost, 61) } }), plus(firstPost, 40));
  assert.equal(paid.reason, "paid");
}

// ---------- 6. Missing config fails closed (no free access, but paid still works) ----------
{
  const now = d("2027-06-01T00:00:00Z");
  assert.equal(post(facts({}), now, null).allowed, false, "missing config must not grant free posting");
  assert.equal(post(facts({}), now, null).reason, "access_expired");
  assert.equal(post(facts({ paid: { planKey: "poster", endsAt: plus(now, 5) } }), now, null).reason, "paid");
  assert.equal(drive(facts({ firstVehicleApprovedAt: plus(now, -1), vehicleEligibleUntil: plus(now, 100) }), now, null).allowed, false);
}

// ---------- 7. Driver window + waitlist ----------
{
  const now = plus(C.driverWindowStart, 5);
  const approved = { firstVehicleApprovedAt: plus(now, -1), vehicleEligibleUntil: plus(now, 200) };
  assert.equal(drive(facts({}), now).reason, "no_approved_vehicle", "DRIVE needs an approved vehicle");
  const noRegion = drive(facts({ ...approved, operatingRegion: null }), now);
  assert.equal(noRegion.allowed, false); assert.equal(noRegion.reason, "region_required");
  // Ratio 1.0: 3 posters, 2 drivers -> room 1 -> position 1 admitted, position 2 waitlisted.
  const admitted = drive(facts({ ...approved, waitlist: { position: 1, activeDrivers: 2, activePosters: 3 } }), now);
  assert.equal(admitted.allowed, true); assert.equal(admitted.reason, "driver_window"); assert.equal(admitted.admit, true);
  assert.equal(admitted.endsAt.toISOString(), C.driverWindowEnd.toISOString());
  const waiting = drive(facts({ ...approved, waitlist: { position: 2, activeDrivers: 2, activePosters: 3 } }), now);
  assert.equal(waiting.allowed, false); assert.equal(waiting.reason, "waitlisted"); assert.equal(waiting.waitlistPosition, 2);
  // drivers == ratio x posters -> no room (the new driver would exceed it).
  assert.equal(drive(facts({ ...approved, waitlist: { position: 1, activeDrivers: 3, activePosters: 3 } }), now).reason, "waitlisted");
  assert.equal(lw.waitlistRoom(0, 0, 1), 0, "no posters, no room");
  assert.equal(lw.waitlistRoom(1, 4, 0.5), 1);
  assert.equal(lw.waitlistRoom(0, 3, 1.0), 3, "1.0 x 3 is exactly 3");
  assert.equal(lw.waitlistRoom(5, 3, 1.0), 0, "never negative");
  // Persisted admission keeps access through the window regardless of counts.
  const kept = drive(facts({ ...approved, driverAdmittedAt: plus(now, -1) }), now);
  assert.equal(kept.reason, "driver_window");
  assert.equal(drive(facts({ ...approved, driverAdmittedAt: plus(now, -1), vehicleEligibleUntil: plus(C.driverWindowEnd, 10) }), before(C.driverWindowEnd)).allowed, true);
  // Driver window end: no free period afterwards.
  const afterWindow = drive(facts({ ...approved, firstVehicleApprovedAt: plus(C.driverWindowStart, 1), driverAdmittedAt: plus(C.driverWindowStart, 1), vehicleEligibleUntil: plus(C.driverWindowEnd, 100) }), C.driverWindowEnd);
  assert.equal(afterWindow.allowed, false, "free driving ends exactly at driverWindowEnd");
  // New driver after the window: no free period, paid works.
  const late = plus(C.driverWindowEnd, 3);
  const lateApproved = { firstVehicleApprovedAt: plus(late, -1), vehicleEligibleUntil: plus(late, 200) };
  assert.equal(drive(facts(lateApproved), late).allowed, false);
  assert.equal(drive(facts({ ...lateApproved, paid: { planKey: "individual", endsAt: plus(late, 7) } }), late).reason, "paid");
  // Driver window may open after posting opens.
  const C2 = lw.checkLaunchConfig({ ...configRow, driverWindowStart: d("2027-02-01T00:00:00Z") }).config;
  const early = plus(C2.posterWindowStart, 3);
  const e = drive(facts({ firstVehicleApprovedAt: plus(early, -1), vehicleEligibleUntil: plus(early, 200) }), early, C2);
  assert.equal(e.allowed, false); assert.equal(e.reason, "driver_window_not_open");
  assert.equal(e.opensAt.toISOString(), C2.driverWindowStart.toISOString());
  // Posting during the driver window stays free for drivers too.
  assert.equal(post(facts(approved), now).reason, "poster_window");
}

// ---------- 8. Vehicle eligibility: driving locks, posting continues; 14-day fallback ----------
{
  const now = plus(C.posterWindowEnd, 40);
  const approvedAt = plus(C.posterWindowEnd, 1);
  const expired = facts({ firstVehicleApprovedAt: approvedAt, vehicleEligibleUntil: plus(now, -3), paid: { planKey: "individual", endsAt: plus(now, 5) } });
  assert.equal(drive(expired, now).reason, "no_eligible_vehicle", "expired documents lock driving");
  assert.equal(post(expired, now).allowed, true, "posting continues while driving is locked");
  assert.equal(lw.driverPlanEndsAt(expired, C).toISOString(), plus(plus(now, -3), 14).toISOString());
  const fallbackAt = plus(plus(now, -3), 14);
  assert.equal(drive(expired, fallbackAt).reason, "driver_plan_ended", "after 14 days without an eligible vehicle the driver plan ends");
  const bill = lw.computeBilling(facts({ firstJobPostedAt: plus(C.posterWindowEnd, 2), firstVehicleApprovedAt: approvedAt, vehicleEligibleUntil: plus(now, -3) }), C, fallbackAt);
  assert.equal(bill.plan, "poster", "14-day fallback moves the account to poster monthly");
  assert.equal(bill.period, "month");
  const before14 = lw.computeBilling(facts({ firstJobPostedAt: plus(C.posterWindowEnd, 2), firstVehicleApprovedAt: approvedAt, vehicleEligibleUntil: plus(now, -3) }), C, before(fallbackAt));
  assert.equal(before14.plan, "individual", "still on the driver plan before 14 days");
}

// ---------- 9. Poster -> driver switch at +7 days with credit ----------
{
  // Poster joined after the window, trial over, paying monthly from firstPost+30.
  const firstPost = d("2028-01-10T00:00:00Z");
  const posterAnchor = plus(firstPost, 30); // 2028-02-09
  const approvedAt = d("2028-03-01T00:00:00Z");
  const f = facts({ firstJobPostedAt: firstPost, firstVehicleApprovedAt: approvedAt, vehicleEligibleUntil: d("2029-01-01T00:00:00Z"), paid: { planKey: "poster", endsAt: d("2028-03-09T00:00:00Z") }, paidPosterPeriods: [{ start: posterAnchor, end: d("2028-03-09T00:00:00Z") }] });
  // Can take jobs immediately on approval (outside the driver window) under the poster entitlement.
  const immediate = drive(f, approvedAt);
  assert.equal(immediate.allowed, true); assert.equal(immediate.reason, "switch_period");
  assert.equal(immediate.endsAt.toISOString(), plus(approvedAt, 7).toISOString());
  assert.equal(lw.driverSwitchAt(f).toISOString(), plus(approvedAt, 7).toISOString());
  const during = lw.computeBilling(f, C, plus(approvedAt, 3));
  assert.equal(during.plan, "poster", "billing stays monthly for 7 days after first approval");
  const switched = lw.computeBilling(f, C, plus(approvedAt, 7));
  assert.equal(switched.plan, "individual"); assert.equal(switched.period, "7 days");
  assert.equal(switched.chargeableFrom.toISOString(), plus(approvedAt, 7).toISOString());
  assert.equal(switched.currentPeriod.end.toISOString(), plus(approvedAt, 14).toISOString());
  // Poster month 2028-02-09 -> 2028-03-09 (29 days, leap year). Switch 2028-03-08 -> 1 unused day.
  assert.equal(lw.posterPeriodContaining(posterAnchor, plus(approvedAt, 7)).end.toISOString(), "2028-03-09T00:00:00.000Z");
  assert.deepEqual(lw.posterCreditOnSwitch(C, f), { creditDays: 1, periodDays: 29 });
  assert.equal(lw.creditMinorUnits(1299, 1, 29), 45, "credit = 12.99 x 1/29 rounded to pence");
  assert.equal(lw.creditMinorUnits(1299, 0, 29), 0);
  // Poster still in the free window gets no credit (nothing was paid).
  const freePoster = facts({ firstJobPostedAt: plus(C.posterWindowStart, 200), firstVehicleApprovedAt: plus(C.posterWindowStart, 220) });
  assert.equal(lw.posterCreditOnSwitch(C, freePoster).creditDays, 0);
  // Driver-only (never posted before approval): 7-day billing starts on approval, no delay.
  const driverOnly = facts({ firstVehicleApprovedAt: approvedAt, vehicleEligibleUntil: d("2029-01-01T00:00:00Z") });
  assert.equal(lw.driverSwitchAt(driverOnly).toISOString(), approvedAt.toISOString(), "first approved vehicle starts the driver plan");
  assert.equal(lw.computeBilling(driverOnly, C, approvedAt).plan, "individual");
  // Inside the driver window the switch period cannot bypass the waitlist.
  const inWindow = plus(C.driverWindowStart, 10);
  const queued = facts({ firstJobPostedAt: plus(inWindow, -5), firstVehicleApprovedAt: inWindow, vehicleEligibleUntil: plus(inWindow, 100), waitlist: { position: 5, activeDrivers: 4, activePosters: 4 } });
  assert.equal(drive(queued, inWindow).reason, "waitlisted");
  // Admitted drivers in the window are billed from driverWindowEnd.
  const admittedFacts = facts({ firstVehicleApprovedAt: inWindow, vehicleEligibleUntil: plus(inWindow, 400), driverAdmittedAt: inWindow });
  assert.equal(lw.driverBillingAnchor(admittedFacts, C).toISOString(), C.driverWindowEnd.toISOString());
  assert.equal(lw.computeBilling(admittedFacts, C, plus(inWindow, 1)).nextBillingAt.toISOString(), C.driverWindowEnd.toISOString());
}

// ---------- 10. Driver -> poster at end of 7-day period ----------
{
  const approvedAt = d("2028-03-01T00:00:00Z");
  const req = d("2028-03-10T12:00:00Z"); // inside period 2 (03-08 -> 03-15)
  const f = facts({ firstVehicleApprovedAt: approvedAt, vehicleEligibleUntil: d("2029-01-01T00:00:00Z"), switchToPosterRequestedAt: req, paid: { planKey: "individual", endsAt: d("2028-03-15T00:00:00Z") } });
  assert.equal(lw.driverPeriodEndAfter(approvedAt, req).toISOString(), "2028-03-15T00:00:00.000Z");
  assert.equal(lw.driverPeriodEndAfter(approvedAt, d("2028-03-08T00:00:00Z")).toISOString(), "2028-03-08T00:00:00.000Z", "a request on a boundary takes effect at that boundary");
  assert.equal(lw.driverPlanEndsAt(f, C).toISOString(), "2028-03-15T00:00:00.000Z");
  assert.equal(drive(f, before(d("2028-03-15T00:00:00Z"))).allowed, true);
  assert.equal(drive(f, d("2028-03-15T00:00:00Z")).reason, "driver_plan_ended");
  const bill = lw.computeBilling(f, C, d("2028-03-15T00:00:00Z"));
  assert.equal(bill.plan, "poster"); assert.equal(bill.chargeableFrom.toISOString(), "2028-03-15T00:00:00.000Z", "monthly billing resumes at the period end");
}

// ---------- 11. 7-day stacking semantics retained for the driver plan ----------
{
  const sub = read("lib/subscription.ts");
  assert.match(sub, /export function calculatePaidAccessEnd\(startAt: Date\)/);
  assert.match(sub, /INDIVIDUAL_ACCESS_DAYS \* DAY_MS/, "driver plan keeps 7-day stacking");
  assert.match(sub, /export function calculatePosterAccessEnd/, "poster plan adds a monthly period");
  assert.match(sub, /POSTER_MONTHLY_PRICE_GBP/, "poster price must come from lib/pricing.ts");
  assert.match(sub, /status: "pending"/);
  assert.doesNotMatch(sub.slice(sub.indexOf("export async function createPendingSubscriptionPayment"), sub.indexOf("export async function confirmSubscriptionPayment")), /status: "paid"/, "pending records only; never mark paid without a provider event");
}

// ---------- 12. India and pilot ----------
{
  const now = before(C.posterWindowStart);
  const india = facts({ market: "india", verified: false, operatingRegion: null });
  assert.equal(post(india, now).reason, "india_free", "India is unchanged: free after phone OTP, even in Month 0");
  assert.equal(drive(india, now).reason, "india_free");
  assert.equal(post({ ...india, phoneVerified: false }, now).reason, "verification_required");
  assert.equal(lw.computeBilling(india, C, now).plan, "none");
  assert.equal(post(india, now, null).reason, "india_free", "India never depends on launch config");
  // Staging UK student pilot / approved tester: 90-day promotional access preserved, even in Month 0 or without config.
  const pilotEnd = plus(now, 90);
  const pilot = facts({ verified: false, pilotFreeEndsAt: pilotEnd, operatingRegion: null });
  assert.equal(post(pilot, now).reason, "pilot");
  assert.equal(drive(pilot, now, null).reason, "pilot");
  assert.equal(post(pilot, now).endsAt.toISOString(), pilotEnd.toISOString());
  assert.equal(post(pilot, pilotEnd).allowed, false, "pilot access ends at its 90-day end");
  assert.equal(lw.computeBilling(pilot, C, now).plan, "none");
  const signup = read("app/api/signup/route.ts");
  assert.match(signup, /new Date\(pilotTrialStartedAt\.getTime\(\) \+ 90 \* 24 \* 60 \* 60 \* 1000\)/, "pilot QA codes keep the 90-day access");
}

// ---------- 13. Operating region ----------
assert.equal(lw.normalizeOperatingRegion("GB", " ls "), "LS");
assert.equal(lw.normalizeOperatingRegion("GB", "M"), "M");
assert.equal(lw.normalizeOperatingRegion("GB", "SW1"), "invalid");
assert.equal(lw.normalizeOperatingRegion("GB", "ABC"), "invalid");
assert.equal(lw.normalizeOperatingRegion("GB", ""), null);
assert.equal(lw.normalizeOperatingRegion("IN", "LS"), "invalid", "India does not use regions");

// ---------- 14. Wiring: POST vs DRIVE callers, no legacy free-time system ----------
{
  const access = read("lib/access.ts");
  assert.match(access, /export async function getPostAccess/);
  assert.match(access, /export async function getDriveAccess/);
  assert.doesNotMatch(access, /trialCycles/, "trial-cycle extensions are removed");
  const usesPost = ["app/api/jobs/route.ts", "app/api/jobs/[id]/edit/route.ts"];
  const usesDrive = ["app/api/jobs/[id]/accept/route.ts", "app/api/jobs/[id]/bid/route.ts", "app/api/jobs/[id]/bids/[bidId]/accept/route.ts"];
  for (const file of usesPost) assert.match(read(file), /getPostAccess\(/, `${file} must check POST`);
  for (const file of usesDrive) assert.match(read(file), /getDriveAccess\(/, `${file} must check DRIVE`);
  assert.match(read("app/api/jobs/[id]/bids/[bidId]/accept/route.ts"), /getDriveAccess\(bid\.bidderId\)/, "accepting a bid re-checks the bidder's DRIVE entitlement");
  const jobs = read("app/api/jobs/route.ts");
  assert.match(jobs, /canBrowseOpenMarketplace =\s*driveAccessCheck\.allowed/, "browsing the open marketplace is a DRIVE action");
  assert.ok(!existsSync(new URL("../../lib/trialCycles.ts", import.meta.url)), "lib/trialCycles.ts removed");
  for (const file of ["lib/promotion.ts", "lib/launchConfig.ts", "prisma/seed-launch-config.ts"].filter((f) => existsSync(new URL(`../../${f}`, import.meta.url)))) {
    assert.doesNotMatch(read(file), /2027-12-31/, `${file} must not hard-code window dates`);
  }
  assert.ok(!existsSync(new URL("../../scripts/ensure-promotion.mjs", import.meta.url)), "hard-coded promotion enforcer removed");
  const launchConfig = read("lib/launchConfig.ts");
  assert.doesNotMatch(launchConfig, /upsert|\.create\(/, "missing config must not be auto-created");
  assert.match(read("lib/verification.ts"), /\/\/ Launch windows replace the per-account promotion/, "verification no longer starts a per-account promotion");
  assert.doesNotMatch(read("lib/referrals.ts"), /freeEndsAt|freeMonthsEarned|extensionCount/, "referrals are recorded but never extend free time");
  const schema = read("prisma/schema.prisma");
  for (const field of ["posterWindowStart", "posterWindowEnd", "driverWindowStart", "driverWindowEnd", "newPosterTrialDays", "driverWaitlistRatio", "operatingRegion", "driverAdmittedAt", "driverWaitlistedAt", "switchToPosterRequestedAt"]) {
    assert.match(schema, new RegExp(`\\b${field}\\b`), `schema must define ${field}`);
  }
  const migration = read("prisma/migrations/20261106020000_launch_windows_entitlements/migration.sql");
  assert.match(migration, /CREATE TABLE "LaunchConfig"/);
  assert.doesNotMatch(migration, /DROP COLUMN|DROP TABLE/, "deprecate, never drop, columns other code still reads");
  assert.doesNotMatch(migration, /INSERT INTO "LaunchConfig"/, "the migration must not invent launch dates");
  const signupRoute = read("app/api/signup/route.ts");
  assert.match(signupRoute, /normalizeOperatingRegion\(country, operatingRegion\)/);
  assert.match(read("app/signup/page.tsx"), /operatingRegion/);
  assert.match(read("app/settings/page.tsx"), /operatingRegion/);
  assert.match(read("app/api/account/route.ts"), /normalizeOperatingRegion/);
  assert.match(read("app/api/account/waitlist/route.ts"), /getDriveAccess/);
  const dashboard = read("app/dashboard/overview/page.tsx");
  assert.doesNotMatch(dashboard, /getTrialCycleStatus|Extensions earned/);
  assert.match(dashboard, /Waitlist position/);
  const plan = pricing.getPlanDisplay("poster", { country: "GB", currency: "GBP" });
  assert.equal(plan.key, "poster"); assert.equal(plan.price, pricing.POSTER_MONTHLY_PRICE_GBP);
  assert.equal(pricing.getPlanDisplay("poster", { country: "IN", currency: "INR" }).price, 0, "India stays free");
}

// ---------- 15. Review fixes (integration PR #179) ----------
{
  // (1) No payment is due while the poster is still free: chargeableFrom in the future.
  const inWindow = plus(C.posterWindowStart, 30);
  const freePoster = facts({ firstJobPostedAt: plus(C.posterWindowStart, 5) });
  const b1 = lw.computeBilling(freePoster, C, inWindow);
  assert.equal(b1.paymentDue, false, "a poster inside the free window must not be able to create a payment");
  assert.equal(b1.nextBillingAt.toISOString(), C.posterWindowEnd.toISOString(), "next billing is the end of the free window");
  const b1b = lw.computeBilling(freePoster, C, C.posterWindowEnd);
  assert.equal(b1b.paymentDue, true, "payment becomes due when the free window ends");
  assert.equal(lw.computeBilling(facts({}), C, inWindow).paymentDue, false, "unused accounts owe nothing");
  const sub = read("lib/subscription.ts");
  assert.match(sub, /!billing\.paymentDue/, "create-payment must require a current chargeable period");

  // (2) Switch credit only for a poster period that was actually paid.
  const firstPost = d("2028-01-10T00:00:00Z");
  const approvedAt = d("2028-03-01T00:00:00Z");
  const unpaid = facts({ firstJobPostedAt: firstPost, firstVehicleApprovedAt: approvedAt, vehicleEligibleUntil: d("2029-01-01T00:00:00Z") });
  assert.equal(lw.posterCreditOnSwitch(C, unpaid).creditDays, 0, "no credit without a confirmed poster payment");
  const paidOther = { ...unpaid, paidPosterPeriods: [{ start: d("2028-02-09T00:00:00Z"), end: d("2028-03-07T00:00:00Z") }] };
  assert.equal(lw.posterCreditOnSwitch(C, paidOther).creditDays, 0, "a paid period that ended before the switch earns no credit");
  const paidCovering = { ...unpaid, paidPosterPeriods: [{ start: d("2028-02-09T00:00:00Z"), end: d("2028-03-09T00:00:00Z") }] };
  assert.deepEqual(lw.posterCreditOnSwitch(C, paidCovering), { creditDays: 1, periodDays: 29 });
  assert.equal(lw.computeBilling(unpaid, C, plus(approvedAt, 7)).creditDays, 0);

  // (3) During the driver window a waitlisted driver is not billable and paying cannot bypass the queue.
  const w = plus(C.driverWindowStart, 10);
  const queued = facts({ firstVehicleApprovedAt: plus(w, -2), vehicleEligibleUntil: plus(w, 200), waitlist: { position: 3, activeDrivers: 4, activePosters: 4 } });
  const qb = lw.computeBilling(queued, C, w);
  assert.notEqual(qb.plan, "individual", "a waitlisted driver must not be on the 7-day plan during the driver window");
  assert.equal(qb.paymentDue, false, "a waitlisted driver owes nothing during the driver window");
  const queuedPaid = { ...queued, paid: { planKey: "individual", endsAt: plus(w, 5) } };
  const qd = lw.computeDriveEntitlement(queuedPaid, C, w);
  assert.equal(qd.allowed, false, "paying must not bypass the driver waitlist");
  assert.equal(qd.reason, "waitlisted");
  // Admitted drivers are free until driverWindowEnd and billed from then.
  const admitted = { ...queued, driverAdmittedAt: plus(w, -1), waitlist: null };
  assert.equal(lw.computeBilling(admitted, C, w).paymentDue, false);
  assert.equal(lw.computeBilling(admitted, C, C.driverWindowEnd).paymentDue, true);
  // After the window a paid driver plan works as before.
  const late = plus(C.driverWindowEnd, 3);
  assert.equal(lw.computeDriveEntitlement(facts({ firstVehicleApprovedAt: plus(late, -1), vehicleEligibleUntil: plus(late, 200), paid: { planKey: "individual", endsAt: plus(late, 7) } }), C, late).reason, "paid");

  // (4) Switch-to-poster endpoint and dashboard control exist and are wired.
  const route = read("app/api/account/plan/switch-to-poster/route.ts");
  assert.match(route, /withApiMetrics\("\/api\/account\/plan\/switch-to-poster"/);
  assert.match(route, /enforceRateLimit\(/);
  assert.match(route, /getServerSession\(authOptions\)/);
  assert.match(route, /switchToPosterRequestedAt: now/);
  assert.match(route, /switchToPosterRequestedAt: null/, "the request can be cancelled before it takes effect");
  assert.match(route, /driverPlanEndsAt/, "cancelling is only allowed before the switch takes effect");
  assert.match(read("docs/security/api-route-access-inventory.md"), /`\/api\/account\/plan\/switch-to-poster` \| POST, DELETE/);
  assert.match(read("app/dashboard/overview/page.tsx"), /PlanSwitchControl/);
  assert.match(read("components/plan-switch-control.tsx"), /\/api\/account\/plan\/switch-to-poster/);

  // (5) Waitlist queries exclude stale entries.
  const access = read("lib/access.ts");
  const staleFilter = access.slice(access.indexOf("function waitlistEligibleWhere"), access.indexOf("function waitlistEligibleWhere") + 900);
  assert.match(staleFilter, /verificationStatus: "verified"/, "only person-verified accounts hold waitlist places or count as active drivers");
  assert.match(staleFilter, /deletionRequestedAt: null/);
  assert.match(staleFilter, /insuranceValidUntil: \{ gte:/, "accounts without a currently eligible vehicle are excluded");
  assert.match(access.slice(access.indexOf("async function regionCounts")), /waitlistEligibleWhere\(/);
  assert.match(access.slice(access.indexOf("async function waitlistPosition")), /waitlistEligibleWhere\(/);

  // (6) The waitlist transaction is idempotent and runs only when state actually changes.
  assert.match(access, /driverWaitlistedAt: null/, "joining the waitlist uses a conditional (idempotent) write");
}

console.log("Entitlements contract passed: config fail-closed, Month 0, poster window, 30-day new-poster trial, driver window + waitlist ratio, 14-day fallback, poster->driver +7d with credit, driver->poster at period end, India, pilot, POST/DRIVE wiring.");
