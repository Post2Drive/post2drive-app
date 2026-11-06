#!/usr/bin/env node
// Cancellation limits must be counted from the append-only JobActivity
// history, not from Job.cancelledById/cancelledAt (overwritten per job).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  CANCELLATION_LIMIT_PER_WEEK,
  CANCELLATION_LIMIT_PER_MONTH,
  CANCELLATION_WINDOW_WEEK_DAYS,
  CANCELLATION_WINDOW_MONTH_DAYS,
  SELF_INITIATED_CANCELLATION_ACTIONS,
  countSelfInitiatedCancellations,
  exceedsCancellationLimits,
} from "../../lib/cancellationPolicy.ts";

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");

// --- Config constants: named, adjustable, unchanged values ----------------
assert.equal(CANCELLATION_LIMIT_PER_WEEK, 5, "weekly limit stays 5");
assert.equal(CANCELLATION_LIMIT_PER_MONTH, 15, "monthly limit stays 15");
assert.equal(CANCELLATION_WINDOW_WEEK_DAYS, 7);
assert.equal(CANCELLATION_WINDOW_MONTH_DAYS, 30);

// --- Counted actions: self-initiated only, never incident terminations ----
assert.deepEqual(
  [...SELF_INITIATED_CANCELLATION_ACTIONS].sort(),
  ["DRIVER_BACKED_OUT", "DRIVER_UNASSIGNED", "JOB_CANCELLED"],
  "only poster cancel, driver back-out and poster unassign count",
);
assert.ok(!SELF_INITIATED_CANCELLATION_ACTIONS.includes("JOB_TERMINATED_WITH_INCIDENT"));

// The counted action names must match what the routes actually write.
assert.ok(read("app/api/jobs/[id]/cancel/route.ts").includes('action: "JOB_CANCELLED"'));
assert.ok(read("app/api/jobs/[id]/driver-cancel/route.ts").includes('action: "DRIVER_BACKED_OUT"'));
assert.ok(read("app/api/jobs/[id]/unassign/route.ts").includes('action: "DRIVER_UNASSIGNED"'));
assert.ok(read("app/api/jobs/[id]/incidents/terminate/route.ts").includes('action: "JOB_TERMINATED_WITH_INCIDENT"'));
assert.ok(read("app/api/admin/incidents/resolve/route.ts").includes('action: "JOB_TERMINATED_WITH_INCIDENT"'));

// --- Pure counting -------------------------------------------------------
const now = new Date("2026-11-06T12:00:00.000Z");
const daysAgo = (d) => new Date(now.getTime() - d * 24 * 60 * 60 * 1000);
const me = "acct-me";
const other = "acct-other";

// Overwrite scenario: driver (me) backs out of job-1, then the poster cancels
// job-1. Job.cancelledById now points at the poster, but my back-out must
// still count against me, and the poster's cancel against the poster.
const overwrite = [
  { jobId: "job-1", actorId: me, action: "DRIVER_BACKED_OUT", createdAt: daysAgo(2) },
  { jobId: "job-1", actorId: other, action: "JOB_CANCELLED", createdAt: daysAgo(1) },
];
assert.deepEqual(countSelfInitiatedCancellations(overwrite, me, now), { week: 1, month: 1 });
assert.deepEqual(countSelfInitiatedCancellations(overwrite, other, now), { week: 1, month: 1 });

// Repeated self-initiated events on the same job each count (old code: 1).
const repeated = [
  { jobId: "job-2", actorId: other, action: "DRIVER_UNASSIGNED", createdAt: daysAgo(3) },
  { jobId: "job-2", actorId: other, action: "DRIVER_UNASSIGNED", createdAt: daysAgo(2) },
];
assert.deepEqual(countSelfInitiatedCancellations(repeated, other, now), { week: 2, month: 2 });

// Incident terminations (user or admin) and unrelated actions never count.
const excluded = [
  { jobId: "job-3", actorId: me, action: "JOB_TERMINATED_WITH_INCIDENT", createdAt: daysAgo(1) },
  { jobId: "job-4", actorId: me, action: "INCIDENT_RESOLUTION_RECORDED", createdAt: daysAgo(1) },
  { jobId: "job-5", actorId: me, action: "PICKUP_CONFIRMED", createdAt: daysAgo(1) },
  { jobId: "job-6", actorId: null, action: "JOB_TERMINATED_WITH_INCIDENT", createdAt: daysAgo(1) },
];
assert.deepEqual(countSelfInitiatedCancellations(excluded, me, now), { week: 0, month: 0 });

// Window boundaries: 7 days for week, 30 days for month, older ignored.
const windows = [
  { jobId: "a", actorId: me, action: "JOB_CANCELLED", createdAt: daysAgo(6.9) },
  { jobId: "b", actorId: me, action: "JOB_CANCELLED", createdAt: daysAgo(7.1) },
  { jobId: "c", actorId: me, action: "JOB_CANCELLED", createdAt: daysAgo(29.9) },
  { jobId: "d", actorId: me, action: "JOB_CANCELLED", createdAt: daysAgo(30.1) },
];
assert.deepEqual(countSelfInitiatedCancellations(windows, me, now), { week: 1, month: 3 });

// Thresholds: restricted at >= limit, same as before.
assert.equal(exceedsCancellationLimits({ week: 4, month: 14 }), false);
assert.equal(exceedsCancellationLimits({ week: 5, month: 5 }), true);
assert.equal(exceedsCancellationLimits({ week: 0, month: 15 }), true);

// --- DB query shape: JobActivity, not Job.cancelledById -------------------
const limits = read("lib/cancellationLimits.ts");
assert.ok(limits.includes("prisma.jobActivity.findMany"), "counts from JobActivity");
assert.ok(!/prisma\.job\.findMany/.test(limits), "must not count from Job rows");
assert.ok(!/cancelledById\s*:|cancelledAt\s*:/.test(limits), "must not query the overwritten cancelledById/cancelledAt fields");
assert.ok(limits.includes("actorId: accountId"), "only actions by this account");
assert.ok(limits.includes("SELF_INITIATED_CANCELLATION_ACTIONS"), "uses the allowlist");
assert.ok(limits.includes("export async function isCancellationRestricted(accountId: string): Promise<boolean>"));

// Index supporting (actorId, action, createdAt) lookups.
const schema = read("prisma/schema.prisma");
const jobActivityModel = schema.slice(schema.indexOf("model JobActivity {"));
assert.ok(jobActivityModel.slice(0, jobActivityModel.indexOf("\n}")).includes("@@index([actorId, action, createdAt])"));
const migration = read("prisma/migrations/20261106050000_job_activity_actor_action_index/migration.sql");
assert.ok(migration.includes('CREATE INDEX CONCURRENTLY IF NOT EXISTS "JobActivity_actorId_action_createdAt_idx" ON "JobActivity"("actorId", "action", "createdAt")'));

// --- Callers unchanged: still gate with isCancellationRestricted + 429 ------
for (const [route, message] of [
  ["app/api/jobs/[id]/cancel/route.ts", "Your account has cancelled too often recently and is temporarily restricted from this action. If this is an emergency or the restriction is mistaken, contact support for review."],
  ["app/api/jobs/[id]/unassign/route.ts", "Your account has cancelled too often recently and is temporarily restricted from this action."],
  ["app/api/jobs/[id]/driver-cancel/route.ts", "Your account has backed out of jobs too often recently and is temporarily restricted from this action."],
]) {
  const src = read(route);
  assert.ok(src.includes('import { isCancellationRestricted } from "@/lib/cancellationLimits";'), `${route} import`);
  assert.ok(/await isCancellationRestricted\(\s*accountId\s*\)/.test(src), `${route} call`);
  assert.ok(src.includes(message), `${route} message unchanged`);
  assert.ok(src.includes("status: 429"), `${route} status unchanged`);
}

console.log("cancellation-history-contract: ok");
