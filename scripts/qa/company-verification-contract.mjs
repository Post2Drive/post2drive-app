import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const schema = read("../../prisma/schema.prisma");
const migration = read("../../prisma/migrations/20261025190000_company_verification_status/migration.sql");
const jobs = read("../../app/api/jobs/route.ts");
const bid = read("../../app/api/jobs/[id]/bid/route.ts");
const accept = read("../../app/api/jobs/[id]/accept/route.ts");
const awardBid = read("../../app/api/jobs/[id]/bids/[bidId]/accept/route.ts");
const submit = read("../../app/api/company-verification/route.ts");
const settings = read("../../app/settings/page.tsx");
const opportunities = read("../../lib/opportunities.ts");

assert.ok(schema.includes("companyVerificationStatus VerificationStatus @default(not_started)"));
assert.ok(schema.includes("companyVerificationSubmittedAt DateTime?"));
assert.ok(schema.includes("companyVerifiedAt DateTime?"));
assert.ok(migration.includes('ADD COLUMN "companyVerificationStatus"'));
assert.ok(migration.includes("DEFAULT 'not_started'"));
assert.ok(submit.includes('companyVerificationStatus: "pending"'));
assert.ok(!submit.includes('companyVerificationStatus: "verified"'));
assert.ok(!submit.includes("isTester"), "test access must not bypass identity verification for company submission");
assert.ok(settings.includes("Company verification"));
assert.ok(settings.includes("/api/company-verification"));
assert.ok(jobs.includes('companyVerificationStatus !== "verified"'));
assert.ok(bid.includes('companyVerificationStatus !== "verified"'));
assert.ok(accept.includes('companyVerificationStatus !== "verified"'));
assert.ok(awardBid.includes('companyVerificationStatus !== "verified"'));
assert.ok(opportunities.includes('driver.companyVerificationStatus !== "verified"'));
assert.ok(!opportunities.includes('driver.type !== "driver"'));

// A test-code flag must never act as a substitute for real trust checks.
assert.ok(!accept.includes("!account?.isTester"));
assert.ok(!accept.includes("!currentDriver.isTester"));
assert.ok(!awardBid.includes("{ isTester: true }"));
assert.ok(!awardBid.includes("!posterVerification.isTester"));
assert.ok(!awardBid.includes("!currentBidder.isTester"));
assert.ok(!opportunities.includes("driver.isTester"));
assert.ok(!opportunities.includes("vehicle.isTester"));

console.log("Company verification and no-tester-bypass contract passed.");
