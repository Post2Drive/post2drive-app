// Behavioural contract for required proof photos at pickup and delivery, and for
// the automatic dispute on a second rejected delivery. Runs the real route code
// against an in-memory fake of Prisma, so it needs no database.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

let checks = 0;
const ok = (value, message) => { assert.ok(value, message); checks++; };
const eq = (actual, expected, message) => { assert.deepEqual(actual, expected, message); checks++; };

function load(path, mocks, extra = {}) {
  const compiled = ts.transpileModule(readFileSync(path, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    fileName: path,
  }).outputText;
  const module = { exports: {} };
  const mockRequire = (name) => {
    if (!(name in mocks)) throw new Error(`Unexpected dependency in isolated test: ${name}`);
    return mocks[name];
  };
  vm.runInNewContext(compiled, { module, exports: module.exports, require: mockRequire, console, Headers, Request, Response, URL, Date, Promise, JSON, ...extra }, { filename: path });
  return module.exports;
}

const marketMock = { MARKETS: { GB: { currency: "GBP" }, IN: { currency: "INR" } } };
const rules = load("lib/marketRules.ts", { "./market.ts": marketMock });
const gateLib = load("lib/proofRequirement.ts", { "./marketRules.ts": rules }, { process: { env: {} } });
const transitions = load("lib/jobTransitions.ts", {});

// ── in-memory state ────────────────────────────────────────────────────────
let job, poster, photos, activities, notifications, session, env;
function reset(overrides = {}, posterOverrides = {}) {
  job = { id: "job1", status: "accepted", posterId: "poster", acceptedById: "driver", deliveryMarkedById: null, pickupConfirmedById: null, ...overrides };
  poster = { country: "GB", currency: "GBP", ...posterOverrides };
  photos = []; activities = []; notifications = []; session = { user: { accountId: "driver" } }; env = {};
}
const matches = (row, where) => Object.entries(where).every(([k, v]) => row[k] === v);
const prisma = {
  account: { findUnique: async ({ where }) => (where.id === job.posterId && poster ? { ...poster } : null) },
  jobProofPhoto: { count: async ({ where }) => photos.filter((p) => matches(p, where)).length },
  job: {
    findUnique: async ({ where }) => (where.id === job.id ? { ...job } : null),
    findUniqueOrThrow: async () => ({ ...job }),
    updateMany: async ({ where, data }) => { if (!matches(job, where)) return { count: 0 }; Object.assign(job, data); return { count: 1 }; },
  },
  jobActivity: {
    count: async ({ where }) => activities.filter((a) => matches(a, where)).length,
    create: async ({ data }) => { const row = { id: `act${activities.length + 1}`, ...data }; activities.push(row); return row; },
  },
  $transaction: async (fn) => fn(prisma),
};
const common = {
  "@/lib/apiMetrics": { withApiMetrics: (_n, handler) => handler },
  "@/lib/rateLimit": { enforceRateLimit: async () => null },
  "@/lib/jobMarket": { requireJobMarketAccess: async () => null },
  "@/lib/jobTransitions": transitions,
  "@/lib/proofRequirement": { checkProofPhotoGate: (db, j, stage) => gateLib.checkProofPhotoGate(db, j, stage, env) },
  "@/lib/notify": { notify: async (_db, input) => { notifications.push(input); return true; } },
  "@/lib/prisma": { prisma },
  "@/lib/auth": { authOptions: {} },
  "next-auth": { getServerSession: async () => session },
  "next/server": { NextResponse: { json: (body, init = {}) => new Response(JSON.stringify(body), { status: init.status ?? 200, headers: { "content-type": "application/json" } }) } },
};
const pickupRoute = load("app/api/jobs/[id]/confirm-pickup/route.ts", common);
const deliveredRoute = load("app/api/jobs/[id]/mark-delivered/route.ts", common);
const rejectRoute = load("app/api/jobs/[id]/reject-delivered/route.ts", common);
const call = async (route) => { const r = await route.POST(new Request("https://x.test/api", { method: "POST", body: "{}" }), { params: Promise.resolve({ id: "job1" }) }); return [r.status, await r.json()]; };
const photo = (over = {}) => photos.push({ jobId: "job1", stage: "pickup", uploadedById: "driver", ...over });
const ON = { POST2DRIVE_PROOF_PHOTOS_ENFORCED: "true" };

// ── the switch ─────────────────────────────────────────────────────────────
eq(gateLib.proofEnforcementOn({}), false, "enforcement is off by default");
eq(gateLib.proofEnforcementOn({ POST2DRIVE_PROOF_PHOTOS_ENFORCED: "false" }), false, "false keeps it off");
eq(gateLib.proofEnforcementOn({ POST2DRIVE_PROOF_PHOTOS_ENFORCED: "1" }), false, "only the exact value true turns it on");
eq(gateLib.proofEnforcementOn(ON), true, "true turns it on");

reset();
eq((await call(pickupRoute))[0], 200, "with enforcement off a UK pickup needs no photo");
reset({ status: "in_transit" });
eq((await call(deliveredRoute))[0], 200, "with enforcement off a UK delivery needs no photo");

// ── pickup gate ────────────────────────────────────────────────────────────
reset(); env = ON;
let [code, body] = await call(pickupRoute);
eq([code, body.code], [409, "PROOF_PHOTO_REQUIRED"], "UK pickup is blocked without a driver photo");
ok(/photo/.test(body.error), "and says why");
eq([job.status, activities.length, notifications.length], ["accepted", 0, 0], "a blocked pickup changes nothing");

reset(); env = ON; photo({ uploadedById: "poster" });
eq((await call(pickupRoute))[0], 409, "the poster's photo does not satisfy the driver requirement");
reset(); env = ON; photo({ stage: "delivery" });
eq((await call(pickupRoute))[0], 409, "a delivery photo does not satisfy pickup");
reset(); env = ON; photos.push({ jobId: "other-job", stage: "pickup", uploadedById: "driver" });
eq((await call(pickupRoute))[0], 409, "a photo on another job does not count");

reset(); env = ON; photo();
eq([(await call(pickupRoute))[0], job.status], [200, "in_transit"], "a driver pickup photo lets the pickup through");
reset(); env = ON; photo(); session = { user: { accountId: "poster" } };
eq([(await call(pickupRoute))[0], job.status], [200, "in_transit"], "the poster may confirm pickup once the driver has added a photo");
reset(); env = ON; session = { user: { accountId: "poster" } };
eq((await call(pickupRoute))[0], 409, "the poster cannot confirm pickup without the driver's photo");

// ── delivery gate ──────────────────────────────────────────────────────────
reset({ status: "in_transit" }); env = ON; photo();
eq([(await call(deliveredRoute))[0], job.status], [409, "in_transit"], "a pickup photo does not satisfy delivery");
reset({ status: "in_transit" }); env = ON;
[code, body] = await call(deliveredRoute);
eq([code, body.code, job.status, activities.length], [409, "PROOF_PHOTO_REQUIRED", "in_transit", 0], "UK delivery is blocked without a driver photo");
reset({ status: "in_transit" }); env = ON; photo({ stage: "delivery" });
eq([(await call(deliveredRoute))[0], job.status, job.deliveryMarkedById], [200, "delivered", "driver"], "a driver delivery photo lets the delivery through");
reset({ status: "in_transit" }); env = ON; photo({ stage: "delivery", uploadedById: "poster" });
eq((await call(deliveredRoute))[0], 409, "the poster's delivery photo does not count");

// ── market rules ───────────────────────────────────────────────────────────
reset({}, { country: "IN", currency: "INR" }); env = ON;
eq((await call(pickupRoute))[0], 200, "India pickup needs no photo");
reset({ status: "in_transit" }, { country: "IN", currency: "INR" }); env = ON;
eq((await call(deliveredRoute))[0], 200, "India delivery needs no photo");
reset({}, { country: "IN", currency: "GBP" }); env = ON;
eq((await call(pickupRoute))[0], 409, "a country and currency mismatch falls back to the strict default");
reset({}, { country: "US", currency: "USD" }); env = ON;
eq((await call(pickupRoute))[0], 409, "an unlisted market uses the strict default");
reset({ acceptedById: "driver" }); env = ON; poster = null;
eq((await call(pickupRoute))[0], 200, "a missing poster record does not block (other checks handle it)");

// ── second rejected delivery opens a dispute ───────────────────────────────
const delivered = () => reset({ status: "delivered", deliveryMarkedById: "driver" });

delivered(); session = { user: { accountId: "driver" } };
eq((await call(rejectRoute))[0], 403, "the party who marked delivered cannot reject it");

delivered(); session = { user: { accountId: "poster" } };
[code, body] = await call(rejectRoute);
eq([code, job.status, job.deliveryMarkedById], [200, "in_transit", null], "a first rejection returns the job to transit");
ok(!body.disputed, "and is not a dispute");
eq(activities.map((a) => a.action), ["DELIVERY_REJECTED"], "the first rejection is logged");

job.status = "delivered"; job.deliveryMarkedById = "driver";
[code, body] = await call(rejectRoute);
eq([code, body.disputed, job.status], [200, true, "disputed"], "a second rejection sends the job to review");
eq(job.deliveryMarkedById, "driver", "the delivery mark is kept so an administrator can still complete the job");
const opened = activities.at(-1);
eq([opened.action, opened.fromStatus, opened.toStatus, opened.actorId], ["DISPUTE_OPENED", "delivered", "disputed", "poster"], "the dispute is logged against the rejecter");
eq([opened.metadata.reason, opened.metadata.openedByRole, opened.metadata.previousStatus, opened.metadata.automatic, opened.metadata.rejectionCount], ["delivery_confirmation", "poster", "delivered", true, 2], "the dispute record carries what the admin list reads");
ok(typeof opened.metadata.notes === "string" && opened.metadata.notes.length > 0, "and a note");
eq(notifications.at(-1).accountId, "driver", "the party who marked delivered is told");
eq(notifications.at(-1).type, "dispute_opened", "with the dispute notification");
ok(notifications.at(-1).eventKey.startsWith("dispute-opened:"), "keyed like other dispute notifications");
eq(activities.filter((a) => a.action === "DELIVERY_REJECTED").length, 1, "the escalating rejection is logged as a dispute, not a second plain rejection");

// A driver may also be the one who rejects (poster marked delivered).
reset({ status: "delivered", deliveryMarkedById: "poster" }); session = { user: { accountId: "driver" } };
activities.push({ jobId: "job1", action: "DELIVERY_REJECTED" });
[code, body] = await call(rejectRoute);
eq([code, body.disputed, activities.at(-1).metadata.openedByRole, notifications.at(-1).accountId], [200, true, "driver", "poster"], "either party's second rejection escalates");

// Races: the state must still be delivered with the same marker when it is written.
delivered(); session = { user: { accountId: "poster" } };
activities.push({ jobId: "job1", action: "DELIVERY_REJECTED" });
const realUpdate = prisma.job.updateMany;
prisma.job.updateMany = async () => ({ count: 0 });
eq([(await call(rejectRoute))[0], job.status, activities.length, notifications.length], [409, "delivered", 1, 0], "a lost race on the second rejection changes and notifies nothing");
prisma.job.updateMany = realUpdate;

// An escalated job is frozen: nothing else moves it except an administrator.
reset({ status: "delivered", deliveryMarkedById: "driver" }); session = { user: { accountId: "poster" } };
activities.push({ jobId: "job1", action: "DELIVERY_REJECTED" });
await call(rejectRoute);
eq(job.status, "disputed", "escalated");
eq([(await call(rejectRoute))[0], job.status], [409, "disputed"], "a disputed job cannot be rejected again");

console.log(`proof requirement contract passed (${checks} checks)`);
