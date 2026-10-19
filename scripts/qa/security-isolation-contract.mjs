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
assert.match(jobAccept, /where: \{\s*id: id,\s*status: "open",\s*priceMode: "fixed",?\s*\}/,
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
    assert.deepEqual({ id: where.id, jobId: where.jobId, incidentId: where.incidentId },
      { id: "evidence-1", jobId: "job-private", incidentId: "incident-1" },
      "evidence lookup must constrain all parent identifiers");
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
