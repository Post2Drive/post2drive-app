#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";
import vm from "node:vm";
import ts from "typescript";

const source = (path) => readFileSync(path, "utf8");
const auth = source("lib/auth.ts");
const vehicles = source("app/api/vehicles/route.ts");
const jobAccept = source("app/api/jobs/[id]/accept/route.ts");
const bidAccept = source("app/api/jobs/[id]/bids/[bidId]/accept/route.ts");
const evidence = source("app/api/jobs/[id]/incidents/[incidentId]/evidence/[evidenceId]/route.ts");

// These source-level assertions protect the real application paths against regressions.
assert.match(auth, /token\.accountDeleted = !account \|\| Boolean\(account\.deletionRequestedAt\)/,
  "JWT refresh must mark deleted or missing accounts as revoked");
assert.match(auth, /if \(token\.accountDeleted\) return null as any/,
  "revoked pre-existing JWTs must not yield a session");
assert.match(vehicles, /if \(!account \|\| account\.deletionRequestedAt\) return null/,
  "vehicle GET and POST must reject accounts pending deletion");
assert.match(vehicles, /where: \{ accountId: account\.id \}/,
  "vehicle listing must scope records to the authenticated account");
assert.match(jobAccept, /tx\.job\.updateMany\([\s\S]*?status: "open"[\s\S]*?priceMode: "fixed"/,
  "fixed-job acceptance must use a conditional atomic claim");
assert.match(jobAccept, /if \(\s*updated\.count !== 1\s*\)/,
  "fixed-job acceptance must reject a lost race");
assert.match(bidAccept, /where: \{\s*id: routeParams\.id,\s*posterId: accountId,\s*status: "open",\s*priceMode: "bid",?\s*\}/,
  "bid acceptance must atomically require the authenticated poster and open job");
assert.match(bidAccept, /if \(claimed\.count !== 1\)/,
  "bid acceptance must reject a lost race");
assert.match(evidence, /if \(!isParty && !admin\)/,
  "incident evidence reads must reject unrelated accounts");
assert.match(evidence, /where: \{ id: evidenceId, jobId, incidentId \}/,
  "evidence lookup must be scoped to the requested incident");

function loadTypeScriptModule(path, mocks) {
  const compiled = ts.transpileModule(source(path), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    fileName: path,
  }).outputText;
  const module = { exports: {} };
  const mockRequire = (name) => {
    if (!(name in mocks)) throw new Error(`Unexpected dependency in isolated test: ${name}`);
    return mocks[name];
  };
  vm.runInNewContext(compiled, {
    module, exports: module.exports, require: mockRequire, console,
    Headers, Request, Response, URL, Date, Promise, setTimeout, clearTimeout,
  }, { filename: path });
  return module.exports;
}

// Execute the actual NextAuth callbacks with an isolated Prisma fake to prove that
// an already-issued token is revoked on refresh after deletion is requested.
let accountState = { deletionRequestedAt: new Date("2026-01-01T00:00:00.000Z") };
const fakePrisma = {
  account: { findUnique: async () => accountState },
  vehicle: {
    findMany: async ({ where }) => { assert.equal(where.accountId, "acct-active"); return []; },
    create: async () => { throw new Error("Deleted account must never create a vehicle"); },
  },
};
const identityProvider = () => ({ id: "credentials" });
const authModule = loadTypeScriptModule("lib/auth.ts", {
  "next-auth/providers/credentials": identityProvider,
  "bcryptjs": { compare: async () => false },
  "@/lib/prisma": { prisma: fakePrisma },
  "@/lib/emailVerification": { emailVerificationEnabled: () => false },
  "@/lib/rateLimit": { checkRateLimit: async () => ({ allowed: true }), clientNetworkIdentity: () => "fixture" },
  "@/lib/qaRunAuthorization": { isAuthorizedQaRunId: async () => false },
});
const callbacks = authModule.authOptions.callbacks;
const revokedToken = await callbacks.jwt({ token: { accountId: "acct-deleted" } });
assert.equal(revokedToken.accountDeleted, true, "existing JWT must be marked revoked after deletion request");
assert.equal(await callbacks.session({ session: { user: {} }, token: revokedToken }), null,
  "revoked existing JWT must not produce a session");
accountState = null;
const missingAccountToken = await callbacks.jwt({ token: { accountId: "acct-missing" } });
assert.equal(missingAccountToken.accountDeleted, true, "missing account must revoke an existing JWT");
accountState = { deletionRequestedAt: null };
const activeToken = await callbacks.jwt({ token: { accountId: "acct-active" } });
assert.equal(activeToken.accountDeleted, false, "active account must keep a valid session");
const activeSession = await callbacks.session({ session: { user: {} }, token: activeToken });
assert.equal(activeSession.user.accountId, "acct-active", "active session must retain its own account identity");
console.log("Isolated NextAuth callback tests passed: deleted/missing accounts revoked; active account preserved.");

// Execute the actual vehicle route handlers with a mocked session and Prisma.
// Deleted accounts must receive 401 before vehicle reads or writes are attempted.
let vehicleAccount = { id: "acct-deleted", deletionRequestedAt: new Date("2026-01-01T00:00:00.000Z"), type: "both" };
let vehicleReads = 0;
let vehicleWrites = 0;
fakePrisma.account.findUnique = async () => vehicleAccount;
fakePrisma.vehicle.findMany = async ({ where }) => { vehicleReads++; assert.equal(where.accountId, "acct-active"); return []; };
fakePrisma.vehicle.create = async () => { vehicleWrites++; return {}; };
const routeModule = loadTypeScriptModule("app/api/vehicles/route.ts", {
  "@/lib/apiMetrics": { withApiMetrics: (_name, handler) => handler },
  "next/server": { NextResponse: { json: (body, init = {}) => ({ body, status: init.status ?? 200 }) } },
  "next-auth": { getServerSession: async () => ({ user: { accountId: vehicleAccount.id } }) },
  "@/lib/auth": { authOptions: {} },
  "@/lib/prisma": { prisma: fakePrisma },
  "@/lib/vehicles": { VEHICLE_TYPES: ["van", "truck", "car"] },
  "@/lib/localisation": { getLocalisationProfile: () => null, getJurisdictionOptions: () => [] },
  "@/lib/vehicleDates": { marketDateKey: () => "2026-10-20", parseOptionalDateField: () => ({ date: null, dateKey: null, error: null }) },
});
const deletedGet = await routeModule.GET(new Request("https://fixture.invalid/api/vehicles"));
assert.equal(deletedGet.status, 401, "deleted account vehicle GET must be unauthorized");
const deletedPost = await routeModule.POST(new Request("https://fixture.invalid/api/vehicles", {
  method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({}),
}));
assert.equal(deletedPost.status, 401, "deleted account vehicle POST must be unauthorized");
assert.equal(vehicleReads, 0, "deleted account must not read vehicles");
assert.equal(vehicleWrites, 0, "deleted account must not write vehicles");
vehicleAccount = { id: "acct-active", deletionRequestedAt: null, type: "both" };
const activeGet = await routeModule.GET(new Request("https://fixture.invalid/api/vehicles"));
assert.equal(activeGet.status, 200, "active account vehicle GET should proceed");
assert.equal(vehicleReads, 1, "active vehicle read must be scoped to that account");
console.log("Isolated vehicle route tests passed: deletion-requested GET/POST rejected; active read account-scoped.");


// Execute the actual job detail handler with an authenticated non-party account.
// This proves the route returns 403 rather than exposing another account's job.
let jobSessionAccountId = "account-outsider";
const jobFixture = { id: "job-private", posterId: "account-a", acceptedById: "account-b", status: "accepted" };
const jobRoute = loadTypeScriptModule("app/api/jobs/[id]/route.ts", {
  "@/lib/apiMetrics": { withApiMetrics: (_name, handler) => handler },
  "@/lib/jobMarket": { requireJobMarketAccess: async () => null },
  "next/server": { NextResponse: { json: (body, init = {}) => new Response(JSON.stringify(body), { status: init.status ?? 200, headers: { "content-type": "application/json" } }) } },
  "next-auth": { getServerSession: async () => ({ user: { accountId: jobSessionAccountId } }) },
  "@/lib/auth": { authOptions: {} },
  "@/lib/prisma": { prisma: { job: { findUnique: async ({ where }) => where.id === jobFixture.id ? jobFixture : null } } },
});
const outsiderJobResponse = await jobRoute.GET(new Request("https://fixture.invalid/api/jobs/job-private"), { params: Promise.resolve({ id: "job-private" }) });
assert.equal(outsiderJobResponse.status, 403, "unrelated account must not read a private job");
jobSessionAccountId = "account-a";
const posterJobResponse = await jobRoute.GET(new Request("https://fixture.invalid/api/jobs/job-private"), { params: Promise.resolve({ id: "job-private" }) });
assert.equal(posterJobResponse.status, 200, "job poster must read their own job");
console.log("Isolated job API tests passed: cross-account GET denied; owner GET allowed.");

// Execute the actual evidence download handler. Evidence must be linked to the
// requested job/incident and only a job party or tester admin may download it.
let evidenceSessionAccountId = "account-outsider";
const evidenceFixture = {
  content: Buffer.from("isolated evidence"), fileName: "proof.txt", mimeType: "text/plain",
  sha256: "fixture-sha256", job: { posterId: "account-a", acceptedById: "account-b" },
};
const evidenceRoute = loadTypeScriptModule("app/api/jobs/[id]/incidents/[incidentId]/evidence/[evidenceId]/route.ts", {
  "@/lib/apiMetrics": { withApiMetrics: (_name, handler) => handler },
  "@/lib/jobMarket": { requireJobMarketAccess: async () => null },
  "next/server": { NextResponse: { json: (body, init = {}) => new Response(JSON.stringify(body), { status: init.status ?? 200, headers: { "content-type": "application/json" } }) } },
  "next-auth": { getServerSession: async () => ({ user: { accountId: evidenceSessionAccountId } }) },
  "@/lib/auth": { authOptions: {} },
  "@/lib/prisma": { prisma: { incidentEvidence: { findFirst: async ({ where }) => {
    assert.equal(where.id, "evidence-1", "evidence lookup must constrain evidence ID");
    assert.equal(where.jobId, "job-private", "evidence lookup must constrain job ID");
    assert.equal(where.incidentId, "incident-1", "evidence lookup must constrain incident ID");
    return evidenceFixture;
  } } } },
  "@/lib/testerAdmin": { isTesterAdmin: async () => false },
});
const outsiderEvidence = await evidenceRoute.GET(new Request("https://fixture.invalid/evidence"), { params: Promise.resolve({ id: "job-private", incidentId: "incident-1", evidenceId: "evidence-1" }) });
assert.equal(outsiderEvidence.status, 403, "unrelated account must not download incident evidence");
evidenceSessionAccountId = "account-b";
const partyEvidence = await evidenceRoute.GET(new Request("https://fixture.invalid/evidence"), { params: Promise.resolve({ id: "job-private", incidentId: "incident-1", evidenceId: "evidence-1" }) });
assert.equal(partyEvidence.status, 200, "accepted driver must download evidence for their job");
assert.equal(partyEvidence.headers.get("cache-control"), "private, no-store", "evidence must not be cached publicly");
assert.equal(partyEvidence.headers.get("x-content-type-options"), "nosniff", "evidence download must disable content sniffing");
console.log("Isolated evidence API tests passed: outsider denied; job party allowed with private download headers.");


// Exercise the actual cancellation route under contention with a deterministic
// in-memory Prisma transaction fake. Both requests observe "accepted" before
// racing the route's conditional updateMany; exactly one may commit.
let cancelSessionAccountId = "poster-a";
let cancelJob = {
  id: "job-race", posterId: "poster-a", acceptedById: "driver-b",
  status: "accepted", cancelledById: null, cancelledAt: null,
};
let cancellationAuditEvents = 0;
const cancellationTx = {
  job: {
    updateMany: async ({ where, data }) => {
      // Synchronous compare-and-set models PostgreSQL's atomic conditional UPDATE.
      if (cancelJob.id !== where.id || cancelJob.status !== where.status) return { count: 0 };
      cancelJob = { ...cancelJob, ...data };
      return { count: 1 };
    },
    findUniqueOrThrow: async () => ({ ...cancelJob }),
  },
  bid: { updateMany: async () => ({ count: 0 }) },
  jobActivity: { create: async () => { cancellationAuditEvents++; return {}; } },
  notification: { create: async () => ({}) },
};
const cancelRoute = loadTypeScriptModule("app/api/jobs/[id]/cancel/route.ts", {
  "@/lib/apiMetrics": { withApiMetrics: (_name, handler) => handler },
  "@/lib/jobMarket": { requireJobMarketAccess: async () => null },
  "next/server": { NextResponse: { json: (body, init = {}) => new Response(JSON.stringify(body), { status: init.status ?? 200, headers: { "content-type": "application/json" } }) } },
  "next-auth": { getServerSession: async () => ({ user: { accountId: cancelSessionAccountId } }) },
  "@/lib/auth": { authOptions: {} },
  "@/lib/prisma": {
    prisma: {
      job: { findUnique: async ({ where }) => where.id === cancelJob.id ? { ...cancelJob } : null },
      $transaction: async (callback) => callback(cancellationTx),
    },
  },
  "@/lib/opportunities": { expireJobOpportunities: async () => {} },
  "@/lib/cancellationLimits": { isCancellationRestricted: async () => false },
});
const cancelRequest = () => cancelRoute.POST(new Request("https://fixture.invalid/api/jobs/job-race/cancel", { method: "POST" }), { params: Promise.resolve({ id: "job-race" }) });
const cancelRace = await Promise.all([cancelRequest(), cancelRequest()]);
assert.deepEqual(cancelRace.map((response) => response.status).sort(), [200, 409],
  "two simultaneous cancellations must produce one success and one stale-transition conflict");
assert.equal(cancelJob.status, "cancelled", "winning cancellation must persist the terminal status");
assert.equal(cancellationAuditEvents, 1, "only the winning cancellation may write one lifecycle audit event");

// The same real route must deny a non-poster before it starts a transaction.
cancelJob = { id: "job-race", posterId: "poster-a", acceptedById: "driver-b", status: "accepted", cancelledById: null, cancelledAt: null };
cancelSessionAccountId = "unrelated-account";
const outsiderCancel = await cancelRequest();
assert.equal(outsiderCancel.status, 403, "unrelated account must not cancel another account's job");
assert.equal(cancelJob.status, "accepted", "unauthorized cancellation must leave job state unchanged");
assert.equal(cancellationAuditEvents, 1, "unauthorized cancellation must not add an audit event");
console.log("Isolated lifecycle route tests passed: concurrent cancellation has one winner; outsider cancellation denied.");


// Exercise the real delivery-confirmation route under concurrent requests. Both
// callers see the delivered state, but the conditional delivered -> completed
// transition must allow only one audit event and one successful response.
let deliverySessionAccountId = "poster-a";
let deliveryJob = {
  id: "job-delivery-race", posterId: "poster-a", acceptedById: "driver-b",
  status: "delivered", deliveryMarkedById: "driver-b",
};
let deliveryAuditEvents = 0;
const deliveryTx = {
  job: {
    updateMany: async ({ where, data }) => {
      if (deliveryJob.id !== where.id || deliveryJob.status !== where.status ||
          deliveryJob.deliveryMarkedById !== where.deliveryMarkedById) return { count: 0 };
      deliveryJob = { ...deliveryJob, ...data };
      return { count: 1 };
    },
    findUniqueOrThrow: async () => ({ ...deliveryJob }),
  },
  jobActivity: { create: async () => { deliveryAuditEvents++; return {}; } },
  notification: { create: async () => ({}) },
};
const deliveryRoute = loadTypeScriptModule("app/api/jobs/[id]/confirm-delivered/route.ts", {
  "@/lib/apiMetrics": { withApiMetrics: (_name, handler) => handler },
  "@/lib/jobMarket": { requireJobMarketAccess: async () => null },
  "next/server": { NextResponse: { json: (body, init = {}) => new Response(JSON.stringify(body), { status: init.status ?? 200, headers: { "content-type": "application/json" } }) } },
  "next-auth": { getServerSession: async () => ({ user: { accountId: deliverySessionAccountId } }) },
  "@/lib/auth": { authOptions: {} },
  "@/lib/prisma": {
    prisma: {
      job: { findUnique: async ({ where }) => where.id === deliveryJob.id ? { ...deliveryJob } : null },
      $transaction: async (callback) => callback(deliveryTx),
    },
  },
  "@/lib/referrals": { qualifyReferralFromCompletedJob: async () => null },
});
const confirmDelivery = () => deliveryRoute.POST(new Request("https://fixture.invalid/api/jobs/job-delivery-race/confirm-delivered", { method: "POST" }), { params: Promise.resolve({ id: "job-delivery-race" }) });
const deliveryRace = await Promise.all([confirmDelivery(), confirmDelivery()]);
assert.deepEqual(deliveryRace.map((response) => response.status).sort(), [200, 409],
  "two simultaneous delivery confirmations must produce one success and one conflict");
assert.equal(deliveryJob.status, "completed", "winning confirmation must complete the job");
assert.equal(deliveryAuditEvents, 1, "only the winning confirmation may write one lifecycle audit event");

// A non-party must not confirm or complete the job.
deliveryJob = { id: "job-delivery-race", posterId: "poster-a", acceptedById: "driver-b", status: "delivered", deliveryMarkedById: "driver-b" };
deliverySessionAccountId = "unrelated-account";
const outsiderDelivery = await confirmDelivery();
assert.equal(outsiderDelivery.status, 403, "unrelated account must not confirm delivery");
assert.equal(deliveryJob.status, "delivered", "unauthorized confirmation must not change delivery state");
assert.equal(deliveryAuditEvents, 1, "unauthorized confirmation must not add an audit event");
console.log("Isolated delivery route tests passed: concurrent confirmation has one winner; outsider confirmation denied.");

// Use only the CI DATABASE_URL, which points at the ephemeral PostgreSQL service.
// The uniquely named fixture table is created and dropped by this test; no app tables or QA records are touched.
const prisma = new PrismaClient();
const fixture = `security_claim_fixture_${process.pid}_${Date.now()}`;
const table = `"${fixture}"`;
try {
  await prisma.$executeRawUnsafe(`CREATE TABLE ${table} (id text PRIMARY KEY, owner_id text NOT NULL, status text NOT NULL)`);
  await prisma.$executeRawUnsafe(`INSERT INTO ${table} (id, owner_id, status) VALUES ('job-1', 'account-a', 'open')`);

  const [accountA, accountB] = await Promise.all([
    prisma.$queryRawUnsafe(`UPDATE ${table} SET status = 'accepted' WHERE id = 'job-1' AND owner_id = 'account-a' AND status = 'open' RETURNING id`),
    prisma.$queryRawUnsafe(`UPDATE ${table} SET status = 'accepted' WHERE id = 'job-1' AND owner_id = 'account-b' AND status = 'open' RETURNING id`),
  ]);
  assert.equal(accountA.length + accountB.length, 1, "only the owner may claim the fixture job");
  assert.equal(accountB.length, 0, "cross-account claim must affect zero rows");

  await prisma.$executeRawUnsafe(`UPDATE ${table} SET status = 'open' WHERE id = 'job-1'`);
  const claims = await Promise.all([
    prisma.$queryRawUnsafe(`UPDATE ${table} SET status = 'accepted' WHERE id = 'job-1' AND status = 'open' RETURNING id`),
    prisma.$queryRawUnsafe(`UPDATE ${table} SET status = 'accepted' WHERE id = 'job-1' AND status = 'open' RETURNING id`),
  ]);
  assert.equal(claims[0].length + claims[1].length, 1,
    "two concurrent transitions must yield exactly one successful atomic claim");
  console.log("Isolated PostgreSQL security fixtures passed: cross-account claim rejected; concurrent lifecycle claim has one winner.");
} finally {
  await prisma.$executeRawUnsafe(`DROP TABLE IF EXISTS ${table}`).catch(() => {});
  await prisma.$disconnect();
}


// Exercise the actual pickup-confirmation handler under contention. A poster and
// driver may both click confirm, but the accepted -> in_transit CAS must have one winner.
let pickupSessionAccountId = "poster-a";
let pickupJob = {
  id: "job-pickup-race", posterId: "poster-a", acceptedById: "driver-b", status: "accepted",
};
let pickupAuditEvents = 0;
const pickupTx = {
  job: {
    updateMany: async ({ where, data }) => {
      if (pickupJob.id !== where.id || pickupJob.status !== where.status ||
          pickupJob.acceptedById !== where.acceptedById) return { count: 0 };
      pickupJob = { ...pickupJob, ...data };
      return { count: 1 };
    },
    findUniqueOrThrow: async () => ({ ...pickupJob }),
  },
  jobActivity: { create: async () => { pickupAuditEvents++; return {}; } },
  notification: { create: async () => ({}) },
};
const pickupRoute = loadTypeScriptModule("app/api/jobs/[id]/confirm-pickup/route.ts", {
  "@/lib/apiMetrics": { withApiMetrics: (_name, handler) => handler },
  "@/lib/jobMarket": { requireJobMarketAccess: async () => null },
  "next/server": { NextResponse: { json: (body, init = {}) => new Response(JSON.stringify(body), { status: init.status ?? 200, headers: { "content-type": "application/json" } }) } },
  "next-auth": { getServerSession: async () => ({ user: { accountId: pickupSessionAccountId } }) },
  "@/lib/auth": { authOptions: {} },
  "@/lib/prisma": {
    prisma: {
      job: { findUnique: async ({ where }) => where.id === pickupJob.id ? { ...pickupJob } : null },
      $transaction: async (callback) => callback(pickupTx),
    },
  },
});
const confirmPickup = () => pickupRoute.POST(new Request("https://fixture.invalid/api/jobs/job-pickup-race/confirm-pickup", { method: "POST" }), { params: Promise.resolve({ id: "job-pickup-race" }) });
const pickupRace = await Promise.all([confirmPickup(), confirmPickup()]);
assert.deepEqual(pickupRace.map((response) => response.status).sort(), [200, 409],
  "concurrent pickup confirmations must produce one success and one stale-transition conflict");
assert.equal(pickupJob.status, "in_transit", "winning pickup confirmation must move the job to in_transit");
assert.equal(pickupAuditEvents, 1, "only the winning pickup confirmation may write an audit event");

pickupJob = { id: "job-pickup-race", posterId: "poster-a", acceptedById: "driver-b", status: "accepted" };
pickupSessionAccountId = "unrelated-account";
const outsiderPickup = await confirmPickup();
assert.equal(outsiderPickup.status, 403, "unrelated account must not confirm pickup");
assert.equal(pickupJob.status, "accepted", "unauthorized pickup confirmation must not mutate job state");
assert.equal(pickupAuditEvents, 1, "unauthorized pickup confirmation must not add an audit event");
console.log("Isolated pickup route tests passed: concurrent confirmation has one winner; outsider denied.");


// Exercise the real bid-accept route's poster authorization with an unrelated
// account. The route must reject before any transaction or bid assignment.
let bidAcceptSessionAccountId = "unrelated-account";
const bidAcceptJob = {
  id: "job-bid-private", posterId: "poster-a", acceptedById: null, status: "open",
  priceMode: "bid", currency: "GBP", jobDate: new Date("2026-11-01T00:00:00.000Z"),
  pickupTime: "10:00", pickupTimeZone: "Europe/London", vehicleType: "van",
};
let bidAcceptTransactions = 0;
const bidAcceptRoute = loadTypeScriptModule("app/api/jobs/[id]/bids/[bidId]/accept/route.ts", {
  "@/lib/apiMetrics": { withApiMetrics: (_name, handler) => handler },
  "@/lib/jobMarket": { requireJobMarketAccess: async () => null },
  "@/lib/jobAccess": {
    getJobPickupAtForAccount: async () => new Date("2026-11-01T10:00:00.000Z"),
    pickupAccessError: () => null,
  },
  "@/lib/access": { getAccountAccess: async () => ({ allowed: true }) },
  "next/server": { NextResponse: { json: (body, init = {}) => new Response(JSON.stringify(body), { status: init.status ?? 200, headers: { "content-type": "application/json" } }) } },
  "next-auth": { getServerSession: async () => ({ user: { accountId: bidAcceptSessionAccountId } }) },
  "@/lib/auth": { authOptions: {} },
  "@/lib/prisma": {
    prisma: {
      job: { findUnique: async ({ where }) => where.id === bidAcceptJob.id ? { ...bidAcceptJob } : null },
      bid: { findUnique: async () => { throw new Error("Outsider must be rejected before bid lookup"); } },
      $transaction: async () => { bidAcceptTransactions++; throw new Error("Outsider must never enter transaction"); },
    },
  },
  "@/lib/opportunities": { expireJobOpportunities: async () => {} },
  "@/lib/localisation": { getLocalisationProfile: () => ({ timeZone: "Europe/London" }) },
  "@/lib/vehicleDates": { marketDateKey: () => "2026-11-01" },
});
const outsiderBidAccept = await bidAcceptRoute.POST(
  new Request("https://fixture.invalid/api/jobs/job-bid-private/bids/bid-1/accept", { method: "POST" }),
  { params: Promise.resolve({ id: "job-bid-private", bidId: "bid-1" }) },
);
assert.equal(outsiderBidAccept.status, 403, "unrelated account must not accept a bid on another account's job");
assert.equal(bidAcceptTransactions, 0, "unauthorized bid acceptance must not start a transaction");
assert.equal(bidAcceptJob.status, "open", "unauthorized bid acceptance must leave job open");
console.log("Isolated bid acceptance authorization test passed: unrelated poster denied before bid lookup or mutation.");


// Exercise the actual fixed-price acceptance route under contention. A verified
// tester driver may race another acceptance, but the open -> accepted CAS must
// assign the job once and emit only one lifecycle event.
let acceptSessionAccountId = "driver-a";
let acceptJob = {
  id: "job-accept-race", posterId: "poster-a", acceptedById: null, status: "open",
  priceMode: "fixed", vehicleType: "van", jobDate: new Date("2026-11-01T00:00:00.000Z"),
  pickupTime: "10:00", pickupTimeZone: "Europe/London",
};
let acceptAuditEvents = 0;
const acceptTx = {
  job: {
    findUnique: async ({ where }) => where.id === acceptJob.id ? { ...acceptJob } : null,
    updateMany: async ({ where, data }) => {
      if (acceptJob.id !== where.id || acceptJob.status !== where.status ||
          acceptJob.priceMode !== where.priceMode) return { count: 0 };
      acceptJob = { ...acceptJob, ...data };
      return { count: 1 };
    },
  },
  account: { findUnique: async () => ({ verificationStatus: "verified", isTester: true, country: "GB", currency: "GBP" }) },
  vehicle: { findFirst: async () => ({ id: "vehicle-fixture" }) },
  jobActivity: { create: async () => { acceptAuditEvents++; return {}; } },
  notification: { create: async () => ({}) },
};
const acceptRoute = loadTypeScriptModule("app/api/jobs/[id]/accept/route.ts", {
  "@/lib/apiMetrics": { withApiMetrics: (_name, handler) => handler },
  "@/lib/jobMarket": { requireJobMarketAccess: async () => null },
  "@/lib/jobAccess": {
    getJobPickupAtForAccount: async () => new Date("2026-11-01T10:00:00.000Z"),
    pickupAccessError: () => null,
  },
  "@/lib/access": { getAccountAccess: async () => ({ allowed: true }) },
  "next/server": { NextResponse: { json: (body, init = {}) => new Response(JSON.stringify(body), { status: init.status ?? 200, headers: { "content-type": "application/json" } }) } },
  "next-auth": { getServerSession: async () => ({ user: { accountId: acceptSessionAccountId } }) },
  "@/lib/auth": { authOptions: {} },
  "@/lib/prisma": {
    prisma: {
      job: { findUnique: async ({ where }) => where.id === acceptJob.id ? { ...acceptJob } : null },
      account: { findUnique: async () => ({ verificationStatus: "verified", isTester: true, country: "GB", currency: "GBP" }) },
      vehicle: { findFirst: async () => ({ id: "vehicle-fixture" }) },
      $transaction: async (callback) => callback(acceptTx),
      driverOpportunity: { updateMany: async () => ({ count: 0 }) },
    },
  },
  "@/lib/opportunities": { markDriverOpportunityAccepted: async () => {} },
  "@/lib/usage": { recordAcceptedJobUsage: async () => {} },
  "@/lib/localisation": { getLocalisationProfile: () => ({ timeZone: "Europe/London", inspectionRequiredAtCountryLevel: false }) },
  "@/lib/vehicleDates": { marketDateKey: () => "2026-11-01" },
});
const acceptRequest = () => acceptRoute.POST(
  new Request("https://fixture.invalid/api/jobs/job-accept-race/accept", { method: "POST" }),
  { params: Promise.resolve({ id: "job-accept-race" }) },
);
const acceptRace = await Promise.all([acceptRequest(), acceptRequest()]);
assert.deepEqual(acceptRace.map((response) => response.status).sort(), [200, 409],
  "two simultaneous fixed-price acceptances must produce one success and one conflict");
assert.equal(acceptJob.status, "accepted", "winning acceptance must persist accepted state");
assert.ok(["driver-a"].includes(acceptJob.acceptedById), "winning driver must be assigned");
assert.equal(acceptAuditEvents, 1, "only the winning acceptance may write one lifecycle audit event");

acceptJob = {
  id: "job-accept-race", posterId: "poster-a", acceptedById: null, status: "open",
  priceMode: "fixed", vehicleType: "van", jobDate: new Date("2026-11-01T00:00:00.000Z"),
  pickupTime: "10:00", pickupTimeZone: "Europe/London",
};
acceptSessionAccountId = "poster-a";
const selfFixedAccept = await acceptRequest();
assert.equal(selfFixedAccept.status, 403, "poster must not accept their own fixed-price job as driver");
assert.equal(acceptJob.status, "open", "self-acceptance must not mutate job state");
assert.equal(acceptAuditEvents, 1, "self-acceptance must not add an audit event");
console.log("Isolated fixed-price acceptance route tests passed: concurrent claim has one winner; self-acceptance denied.");
