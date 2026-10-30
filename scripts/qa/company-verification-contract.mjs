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
assert.match(awardBid, /canPostJobs\(posterVerification\)/);
assert.match(awardBid, /canPostJobs\(currentPoster\)/);
assert.match(opportunities, /driver\.type !== "driver".*driver\.companyVerificationStatus !== "verified"/s);
assert.match(opportunities, /driver\.type !== "driver"/);


const pilotFeedback = read("../../app/api/pilot/feedback/route.ts");
const publicProfile = read("../../app/api/profile/[id]/route.ts");

// Company verification is a UK-only workflow; India must remain free of
// person/company verification gates. Suspended accounts cannot submit it.
assert.match(submit, /import \{ isUkAccount \} from "@\/lib\/uk"/);
assert.match(submit, /select: \{ country: true, currency: true, verificationStatus: true, companyVerificationStatus: true \}/);
assert.match(submit, /verificationStatus === "suspended"/);
assert.match(submit, /if \(!isUkAccount\(account\)\)/);
assert.ok(submit.indexOf('verificationStatus === "suspended"') < submit.indexOf("isUkAccount(account)"),
  "suspension must be denied before company-verification market processing");

// Pilot feedback is restricted to the allow-listed UK tester cohort and
// suspended accounts must not read the pilot flag or submit feedback.
assert.equal((pilotFeedback.match(/verificationStatus: true/g) || []).length, 2,
  "both pilot feedback methods must load the persisted suspension state");
assert.equal((pilotFeedback.match(/account\.verificationStatus === "suspended"/g) || []).length, 2,
  "both pilot feedback methods must deny suspended accounts");

// A suspended account may retain account-status/appeal access, but cannot
// inspect other marketplace profiles through the public profile API.
assert.match(publicProfile, /verificationStatus: true/);
assert.match(publicProfile, /viewer\.verificationStatus === "suspended"/);


const adminCompanyVerification = read("../../app/api/admin/company-verification/route.ts");
assert.match(adminCompanyVerification, /where: \{ country: "GB", currency: "GBP", companyVerificationStatus: \{ in: \["pending", "manual_review"\] \} \}/);
assert.match(adminCompanyVerification, /account\.country !== "GB" \|\| account\.currency !== "GBP"/,
  "admin review must reject legacy or tampered non-UK company-verification records");

console.log("Company verification and account-route boundary contract passed.");
