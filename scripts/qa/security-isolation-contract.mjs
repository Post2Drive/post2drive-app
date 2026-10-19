#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { PrismaClient } from "@prisma/client";

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
assert.match(jobAccept, /where: \{\s*id: id,\s*status: "open",\s*priceMode: "fixed"\s*\}/,
  "fixed-job acceptance must use a conditional atomic claim");
assert.match(jobAccept, /if \(\s*updated\.count !== 1\s*\)/,
  "fixed-job acceptance must reject a lost race");
assert.match(bidAccept, /where: \{\s*id: routeParams\.id,\s*posterId: accountId,\s*status: "open",\s*priceMode: "bid"\s*\}/,
  "bid acceptance must atomically require the authenticated poster and open job");
assert.match(bidAccept, /if \(claimed\.count !== 1\)/,
  "bid acceptance must reject a lost race");
assert.match(evidence, /if \(!isParty && !admin\)/,
  "incident evidence reads must reject unrelated accounts");
assert.match(evidence, /where: \\{ id: evidenceId, jobId, incidentId \\}/,
  "evidence lookup must be scoped to the requested incident");
console.log("Security route contracts passed (source-level; not an authenticated HTTP test).");

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
