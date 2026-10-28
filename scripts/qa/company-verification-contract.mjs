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
const opportunities = read("../../lib/opportunities.ts");

assert.match(schema, /companyVerificationStatus\s+VerificationStatus\s+@default\(not_started\)/);
assert.match(schema, /companyVerificationSubmittedAt\s+DateTime\?/);
assert.match(schema, /companyVerifiedAt\s+DateTime\?/);
assert.match(migration, /ADD COLUMN "companyVerificationStatus"/);
assert.match(migration, /DEFAULT 'not_started'/);
assert.match(submit, /companyVerificationStatus: "pending"/);
assert.doesNotMatch(submit, /companyVerificationStatus:\s*"verified"/);
assert.match(jobs, /canPostJobs\(account\)/);
assert.match(bid, /bidderAccount.*type !== "driver".*companyVerificationStatus !== "verified"/s);
assert.match(accept, /account.*type !== "driver".*companyVerificationStatus !== "verified"/s);
assert.match(awardBid, /companyVerificationStatus !== "verified"/);
assert.match(opportunities, /driver\.type !== "driver".*driver\.companyVerificationStatus !== "verified"/s);
assert.match(opportunities, /driver\.type !== "driver"/);

console.log("Company verification contract passed.");
