// Behavioural contract for the dispute routes: opening a dispute (poster or driver)
// and the administrator's resolution. Runs the real route code against an in-memory
// fake of Prisma, so it needs no database.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

let checks = 0;
const ok = (value, message) => { assert.ok(value, message); checks++; };
const eq = (actual, expected, message) => { assert.deepEqual(actual, expected, message); checks++; };

function load(path, mocks) {
  const compiled = ts.transpileModule(readFileSync(path, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    fileName: path,
  }).outputText;
  const module = { exports: {} };
  const mockRequire = (name) => {
    if (!(name in mocks)) throw new Error(`Unexpected dependency in isolated test: ${name}`);
    return mocks[name];
  };
  vm.runInNewContext(compiled, { module, exports: module.exports, require: mockRequire, console, Headers, Request, Response, URL, Date, Promise }, { filename: path });
  return module.exports;
}

const transitions = load("lib/jobTransitions.ts", {});
const disputes = load("lib/disputes.ts", {});

// ── in-memory state ────────────────────────────────────────────────────────
let job, activities, notifications, bids, session, admin, failNextUpdate, flipAfterRead;
function reset(overrides = {}) {
  job = { id: "job1", status: "delivered", posterId: "poster", acceptedById: "driver", deliveryMarkedById: "driver", cancelledById: null, cancelledAt: null, ...overrides };
  activities = []; notifications = []; bids = [{ id: "b1", jobId: "job1", status: "active" }];
  session = { user: { accountId: "poster" } }; admin = false; failNextUpdate = false; flipAfterRead = null;
}
const matches = (row, where) => Object.entries(where).every(([k, v]) => row[k] === v);
const prisma = {
  job: {
    findUnique: async ({ where }) => { if (where.id !== job.id) return null; const copy = { ...job }; if (flipAfterRead) job.status = flipAfterRead; return copy; },
    findUniqueOrThrow: async () => ({ ...job }),
    findMany: async () => (job.status === "disputed" ? [{ ...job, activities: [] }] : []),
    updateMany: async ({ where, data }) => {
      if (failNextUpdate || !matches(job, where)) return { count: 0 };
      Object.assign(job, data); return { count: 1 };
    },
  },
  bid: { updateMany: async ({ where, data }) => { let n = 0; for (const b of bids) if (matches(b, where)) { Object.assign(b, data); n++; } return { count: n }; } },
  jobActivity: { create: async ({ data }) => { const row = { id: `act${activities.length + 1}`, ...data }; activities.push(row); return row; } },
  $transaction: async (fn) => fn(prisma),
};
const common = {
  "@/lib/apiMetrics": { withApiMetrics: (_n, handler) => handler },
  "@/lib/rateLimit": { enforceRateLimit: async () => null },
  "@/lib/jobMarket": { requireJobMarketAccess: async () => null },
  "@/lib/requestBody": { readBoundedJson: async (req) => { try { return { ok: true, value: await req.json() }; } catch { return { ok: false, status: 400 }; } } },
  "@/lib/jobTransitions": transitions,
  "@/lib/disputes": disputes,
  "@/lib/notify": { notify: async (_db, input) => { notifications.push(input); return true; } },
  "@/lib/prisma": { prisma },
  "@/lib/auth": { authOptions: {} },
  "@/lib/testerAdmin": { isTesterAdmin: async () => admin },
  "next-auth": { getServerSession: async () => session },
  "next/server": { NextResponse: { json: (body, init = {}) => new Response(JSON.stringify(body), { status: init.status ?? 200, headers: { "content-type": "application/json" } }) } },
};
const openRoute = load("app/api/jobs/[id]/dispute/route.ts", common);
const resolveRoute = load("app/api/admin/disputes/resolve/route.ts", common);

const post = (body) => new Request("https://x.test/api", { method: "POST", body: JSON.stringify(body), headers: { "content-type": "application/json" } });
const open = async (body) => { const r = await openRoute.POST(post(body), { params: Promise.resolve({ id: "job1" }) }); return [r.status, await r.json()]; };
const resolve = async (body) => { const r = await resolveRoute.POST(post(body)); return [r.status, await r.json()]; };
const good = { reason: "goods_damaged", notes: "The box arrived crushed." };

// ── opening a dispute ──────────────────────────────────────────────────────
reset(); session = null;
eq((await open(good))[0], 401, "opening needs a login");

reset({}); session = { user: { accountId: "stranger" } };
eq((await open(good))[0], 403, "an uninvolved account cannot open a dispute");
eq(job.status, "delivered", "a refused dispute leaves the job alone");

for (const status of ["open", "accepted", "completed", "cancelled"]) {
  reset({ status });
  const [code] = await open(good);
  eq([code, job.status], [409, status], `a ${status} job cannot be disputed`);
}

reset();
eq((await open({ reason: "nonsense", notes: "x" }))[0], 400, "an unknown reason is refused");
eq((await open({ reason: "other", notes: "   " }))[0], 400, "empty notes are refused");
eq((await open({ reason: "other", notes: "x".repeat(4001) }))[0], 400, "overlong notes are refused");

reset();
let [code, body] = await open(good);
eq([code, job.status], [201, "disputed"], "the poster can dispute a delivered job");
eq(activities.length, 1, "one activity row is written");
eq([activities[0].action, activities[0].fromStatus, activities[0].toStatus], ["DISPUTE_OPENED", "delivered", "disputed"], "the activity records the move");
eq([activities[0].metadata.openedByRole, activities[0].metadata.previousStatus, activities[0].metadata.reason], ["poster", "delivered", "goods_damaged"], "the activity records who, from where and why");
eq(notifications.map((n) => n.accountId), ["driver"], "only the other party is notified");
eq(notifications[0].type, "dispute_opened", "the notification type");

reset({ status: "in_transit", deliveryMarkedById: null }); session = { user: { accountId: "driver" } };
[code] = await open(good);
eq([code, job.status], [201, "disputed"], "the driver can dispute a job in transit");
eq(notifications.map((n) => n.accountId), ["poster"], "the poster is told");

[code, body] = await open(good);
eq(code, 409, "a second dispute on the same job is refused");
ok(/already under review/.test(body.error), "and says why");
eq(activities.length, 1, "no extra activity row for the refused dispute");

reset(); failNextUpdate = true;
[code] = await open(good);
eq([code, job.status, activities.length, notifications.length], [409, "delivered", 0, 0], "a lost race changes nothing and notifies nobody");

// The status the route read must still be the status when it writes (compare-and-swap).
reset(); flipAfterRead = "completed";
[code] = await open(good);
eq([code, job.status, activities.length, notifications.length], [409, "completed", 0, 0], "opening cannot overwrite a status that changed after it was read");

// ── resolving a dispute ────────────────────────────────────────────────────
reset({ status: "disputed" }); admin = false;
eq((await resolve({ jobId: "job1", outcome: "completed", notes: "ok" }))[0], 403, "only an administrator can resolve");
eq(job.status, "disputed", "a refused resolution leaves the job disputed");

reset({ status: "disputed" }); admin = true; session = { user: { accountId: "admin1" } };
eq((await resolve({ jobId: "job1", outcome: "bogus", notes: "ok" }))[0], 400, "an unknown outcome is refused");
eq((await resolve({ jobId: "job1", outcome: "completed", notes: "" }))[0], 400, "a written reason is required");
eq((await resolve({ outcome: "completed", notes: "ok" }))[0], 400, "a job id is required");
eq((await resolve({ jobId: "job1", outcome: "open", notes: "ok" }))[0], 400, "a job status is not an outcome");

reset({ status: "delivered" }); admin = true; session = { user: { accountId: "admin1" } };
eq((await resolve({ jobId: "job1", outcome: "completed", notes: "ok" }))[0], 409, "only disputed jobs can be resolved");

reset({ status: "disputed", deliveryMarkedById: null }); admin = true; session = { user: { accountId: "admin1" } };
eq((await resolve({ jobId: "job1", outcome: "completed", notes: "ok" }))[0], 409, "a job never marked delivered cannot be completed");
eq(job.status, "disputed", "and stays disputed");

reset({ status: "disputed" }); admin = true; session = { user: { accountId: "admin1" } };
[code, body] = await resolve({ jobId: "job1", outcome: "completed", notes: "Photos show it arrived intact." });
eq([code, job.status], [201, "completed"], "completed outcome completes the job");
eq([activities[0].action, activities[0].fromStatus, activities[0].toStatus], ["DISPUTE_RESOLVED", "disputed", "completed"], "the resolution is logged");
eq(notifications.map((n) => n.accountId).sort(), ["driver", "poster"], "both parties are told");
eq(activities[0].metadata.automaticPenalty, false, "no automatic penalty is recorded");
[code] = await resolve({ jobId: "job1", outcome: "completed", notes: "again" });
eq(code, 409, "a resolved dispute cannot be resolved twice");

reset({ status: "disputed" }); admin = true; session = { user: { accountId: "admin1" } };
[code] = await resolve({ jobId: "job1", outcome: "return_to_transit", notes: "Driver to redeliver." });
eq([code, job.status, job.deliveryMarkedById], [201, "in_transit", null], "returning to transit clears the delivery mark");

for (const [outcome, fault] of [["cancelled_no_fault", "none"], ["cancelled_driver_fault", "driver"], ["cancelled_poster_fault", "poster"]]) {
  reset({ status: "disputed" }); admin = true; session = { user: { accountId: "admin1" } };
  [code] = await resolve({ jobId: "job1", outcome, notes: "Decision." });
  eq([code, job.status, job.cancelledById], [201, "cancelled", "admin1"], `${outcome} cancels the job, recorded against the administrator`);
  eq(activities[0].metadata.fault, fault, `${outcome} records fault=${fault}`);
  eq(bids[0].status, "invalidated", `${outcome} invalidates active bids`);
}

reset({ status: "disputed" }); admin = true; session = { user: { accountId: "admin1" } }; failNextUpdate = true;
[code] = await resolve({ jobId: "job1", outcome: "completed", notes: "ok" });
eq([code, job.status, activities.length, notifications.length], [409, "disputed", 0, 0], "a lost race on resolve changes nothing and notifies nobody");

reset({ status: "disputed" }); admin = true; session = { user: { accountId: "admin1" } }; flipAfterRead = "in_transit";
[code] = await resolve({ jobId: "job1", outcome: "cancelled_no_fault", notes: "ok" });
eq([code, job.status, activities.length], [409, "in_transit", 0], "resolving cannot overwrite a status that changed after it was read");

console.log(`dispute routes contract passed (${checks} checks)`);
