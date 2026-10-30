import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";

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

// Person verification is also UK-only. Exercise the actual helper with an
// isolated Prisma stub so India/suspended denials prove no attempt is created.
const verificationSource = read("../../lib/verification.ts");
const verificationRoute = read("../../app/api/verification/start/route.ts");
assert.match(verificationSource, /if \(account\.verificationStatus === "suspended"\)/);
assert.match(verificationSource, /if \(!isUkAccount\(account\)\)/);
assert.ok(
  verificationSource.indexOf('account.verificationStatus === "suspended"') <
    verificationSource.indexOf("if (!isUkAccount(account))") &&
    verificationSource.indexOf("if (!isUkAccount(account))") <
    verificationSource.indexOf("prisma.verificationAttempt.findMany"),
  "person-verification suspension and UK market checks must run before attempt reads or writes",
);
assert.match(verificationRoute, /Person verification is only available to GB \+ GBP accounts/);
assert.match(verificationRoute, /Suspended accounts cannot start verification/);
assert.doesNotMatch(verificationRoute, /error:\s*error\.message/,
  "verification start must not return arbitrary internal exception messages");
assert.doesNotMatch(verificationRoute, /console\.error\([\s\S]*?,\s*error\s*\)/,
  "verification start must not log raw exception objects");

const successfulWebhook = verificationSource.slice(
  verificationSource.indexOf("export async function markVerificationSuccessful"),
  verificationSource.indexOf("export async function markVerificationFailed"),
);
const failedWebhook = verificationSource.slice(
  verificationSource.indexOf("export async function markVerificationFailed"),
);
for (const [name, source] of [["success", successfulWebhook], ["failure", failedWebhook]]) {
  assert.match(source, /if \(!isUkAccount\(attempt\.account\)\)/,
    name + " verification webhook must reject legacy/non-UK attempts");
  assert.match(source, /attempt\.account\.verificationStatus === "suspended"/,
    name + " verification webhook must not process suspended accounts");
}
assert.match(successfulWebhook, /include: \{ account: true \}/);
assert.match(failedWebhook, /include: \{ account: true \}/);

// Run the actual create-attempt helper against isolated Prisma fixtures.
let accountFixture;
let attemptReads = 0;
let attemptCreates = 0;
let accountUpdates = 0;
const fakePrisma = {
  account: {
    findUnique: async () => accountFixture,
    update: async () => { accountUpdates++; },
  },
  verificationAttempt: {
    findMany: async () => { attemptReads++; return []; },
    create: async ({ data }) => { attemptCreates++; return { id: "isolated-attempt", ...data }; },
  },
};
const compiledVerification = ts.transpileModule(verificationSource, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
    esModuleInterop: true,
  },
  fileName: "lib/verification.ts",
}).outputText;
const verificationModule = { exports: {} };
const mockRequire = (name) => {
  if (name === "@/lib/prisma") return { prisma: fakePrisma };
  if (name === "@/lib/uk") return { isUkAccount: (account) => account.country === "GB" && account.currency === "GBP" };
  if (name === "@/lib/promotion") return { startPromotionForVerifiedAccount: async () => {} };
  if (name === "@/lib/referrals") return { markReferralVerified: async () => {} };
  throw new Error("Unexpected person-verification test dependency: " + name);
};
vm.runInNewContext(compiledVerification, {
  module: verificationModule,
  exports: verificationModule.exports,
  require: mockRequire,
  Promise,
  Date,
}, { filename: "lib/verification.ts" });
const { createVerificationAttempt } = verificationModule.exports;

async function assertVerificationDenied(account, expectedMessage) {
  accountFixture = account;
  let caught;
  try {
    await createVerificationAttempt(account.id);
  } catch (error) {
    caught = error;
  }
  assert.equal(caught?.message, expectedMessage);
  assert.equal(attemptReads, 0, "denied person-verification request must not read or create an attempt");
  assert.equal(attemptCreates, 0, "denied person-verification request must not create an attempt");
  assert.equal(accountUpdates, 0, "denied person-verification request must not mutate the account");
}

await assertVerificationDenied(
  { id: "india-account", country: "IN", currency: "INR", verificationStatus: "not_started", planType: "individual", type: "both" },
  "Person verification is only available to GB + GBP accounts.",
);
await assertVerificationDenied(
  { id: "suspended-uk-account", country: "GB", currency: "GBP", verificationStatus: "suspended", planType: "individual", type: "both" },
  "Account is suspended.",
);

accountFixture = {
  id: "active-uk-account", country: "GB", currency: "GBP",
  verificationStatus: "not_started", planType: "individual", type: "both",
};
const activeAttempt = await createVerificationAttempt(accountFixture.id);
assert.equal(activeAttempt.alreadyVerified, false, "active UK accounts retain person-verification access");
assert.equal(activeAttempt.feeCurrency, "GBP");
assert.equal(attemptReads, 1);
assert.equal(attemptCreates, 1);
assert.equal(accountUpdates, 1);

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

console.log("Person/company verification and account-route boundary contract passed: India and suspended accounts are denied before person-verification attempt access; active UK accounts retain access.");
