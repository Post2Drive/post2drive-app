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
assert.ok(settings.includes("Company verification"));
assert.ok(settings.includes("/api/company-verification"));
assert.ok(jobs.includes('companyVerificationStatus !== "verified"'));
assert.ok(bid.includes('companyVerificationStatus !== "verified"'));
assert.ok(accept.includes('companyVerificationStatus !== "verified"'));
assert.ok(awardBid.includes('companyVerificationStatus !== "verified"'));
assert.ok(opportunities.includes('driver.companyVerificationStatus !== "verified"'));
assert.ok(!opportunities.includes('driver.type !== "driver"'));

console.log("Company verification contract passed.");
