// Verification process contract (EXECUTION_PLAN §1 order + responsible person, §5 fees and windows).
// Runs the real pure core (lib/verificationProcess.ts), the real fee recorder
// (lib/verificationFees.ts) and createVerificationAttempt against an in-memory Prisma stub.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { register } from "node:module";
import vm from "node:vm";
import ts from "typescript";

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
const root = new URL("../../", import.meta.url).href;
register(`data:text/javascript,${encodeURIComponent(`
  export async function resolve(specifier, context, next) {
    if (specifier.startsWith("@/")) return next(${JSON.stringify(root)} + specifier.slice(2) + ".ts", context);
    return next(specifier, context);
  }`)}`);
const proc = await import(new URL("../../lib/verificationProcess.ts", import.meta.url));
const fees = await import(new URL("../../lib/verificationFees.ts", import.meta.url));
const eligibility = { canPostJobs: null, isIndiaPhoneVerifiedAccount: null };
{
  // lib/eligibility.ts imports prisma; load only its pure exports with stubs.
  const out = ts.transpileModule(read("lib/eligibility.ts"), { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022 } }).outputText;
  const mod = { exports: {} };
  vm.runInNewContext(out, { module: mod, exports: mod.exports, require: (name) => {
    if (name === "@/lib/prisma") return { prisma: {} };
    if (name === "@/lib/localisation") return { getLocalisationProfile: () => null };
    if (name === "@/lib/vehicleDates") return { marketDateKey: () => "2026-01-01" };
    throw new Error("unexpected " + name);
  } });
  Object.assign(eligibility, mod.exports);
}

const at = (iso) => new Date(iso);
const LONDON = "Europe/London";

// ---------- 1. Order: email -> phone -> person ID ----------
assert.equal(proc.verificationOrderBlock({ phoneVerifiedAt: null }, { emailVerifiedAt: null }), "email_unverified");
assert.equal(proc.verificationOrderBlock({ phoneVerifiedAt: new Date() }, { emailVerifiedAt: null }), "email_unverified", "email comes first even if phone is verified");
assert.equal(proc.verificationOrderBlock({ phoneVerifiedAt: null }, { emailVerifiedAt: new Date() }), "phone_unverified", "UK phone OTP is now required");
assert.equal(proc.verificationOrderBlock({ phoneVerifiedAt: new Date() }, { emailVerifiedAt: new Date() }), null);
assert.equal(proc.verificationOrderBlock({ phoneVerifiedAt: null }, null, { stagingPilotQa: true }), null, "staging-only UK pilot QA keeps its exemption");

// canPostJobs: full order required outside India; India unchanged.
const ukFull = { country: "GB", currency: "GBP", verificationStatus: "verified", companyVerificationStatus: "verified", phoneVerifiedAt: new Date() };
assert.equal(eligibility.canPostJobs(ukFull), true);
assert.equal(eligibility.canPostJobs({ ...ukFull, phoneVerifiedAt: null }), false, "UK posting requires phone OTP");
assert.equal(eligibility.canPostJobs({ ...ukFull, companyVerificationStatus: "pending" }), false);
assert.equal(eligibility.canPostJobs({ ...ukFull, verificationStatus: "pending" }), false);
assert.equal(eligibility.canPostJobs({ country: "IN", currency: "INR", verificationStatus: "not_started", companyVerificationStatus: "not_started", phoneVerifiedAt: new Date() }), true, "India: phone OTP only");
assert.equal(eligibility.canPostJobs({ country: "IN", currency: "INR", verificationStatus: "verified", companyVerificationStatus: "verified", phoneVerifiedAt: null }), false, "India without OTP cannot post");
assert.equal(eligibility.isIndiaPhoneVerifiedAccount({ country: "IN", currency: "INR", phoneVerifiedAt: new Date() }), true);

// ---------- 2. Fees per path ----------
assert.equal(proc.verificationPathForAccountType("poster"), "poster");
assert.equal(proc.verificationPathForAccountType("driver"), "driver");
assert.equal(proc.verificationPathForAccountType("both"), "driver");
const total = (path, extra, currency = "GBP") => proc.verificationFeeTotalMinorUnits(proc.verificationPathFeeLines(path, extra), currency);
assert.equal(total("poster", 0), 250, "poster Step 2 = 2.50");
assert.equal(total("driver", 0), 350, "driver Step 3 = 3.50, no 2.50 on top");
assert.equal(total("driver", 3), 500, "3.50 + 3 x 0.50 in one record");
assert.equal(total("driver", 0, "EUR"), 350, "EUR uses the same numbers in cents");
assert.deepEqual(proc.verificationPathFeeLines("driver", 0).map((l) => l.code), ["driverAndFirstVehicle"], "driver-only path never includes personAndCompany");
assert.throws(() => proc.verificationPathFeeLines("driver", -1));

// ---------- 3. Fee recorder: one pending record, idempotent, India free ----------
function memoryFeeDb() {
  const rows = [];
  return {
    rows,
    verificationFeePayment: {
      findUnique: async ({ where }) => rows.find((r) => r.idempotencyKey === where.idempotencyKey) ?? null,
      findMany: async ({ where }) => rows.filter((r) => r.accountId === where.accountId).map((r) => ({ vehicleIds: r.vehicleIds })),
      findFirst: async ({ where }) => rows.find((r) => r.accountId === where.accountId && where.action.in.includes(r.action)) ?? null,
      create: async ({ data }) => { const row = { id: "fee-" + (rows.length + 1), ...data }; rows.push(row); return row; },
    },
  };
}
{
  const db = memoryFeeDb();
  const input = { accountId: "a1", country: "GB", currency: "GBP", action: "driver_verification", lines: proc.verificationPathFeeLines("driver", 1), idempotencyKey: "k1", vehicleIds: ["v1", "v2"] };
  const first = await fees.recordVerificationFee(db, input);
  assert.equal(first.created, true);
  assert.equal(first.record.status, "pending", "fee is payable/pending, never paid");
  assert.equal(first.record.amountMinorUnits, 400);
  assert.equal(first.record.lineItems.length, 2, "first vehicle + extra vehicle in ONE record");
  const replay = await fees.recordVerificationFee(db, input);
  assert.equal(replay.created, false, "same action never charged twice");
  assert.equal(db.rows.length, 1);
  assert.deepEqual(await fees.uncoveredVehicleIds(db, "a1", ["v1", "v2", "v3"]), ["v3"], "covered vehicles are not charged again");
  assert.equal(await fees.recordVerificationFee(db, { ...input, country: "IN", currency: "INR", idempotencyKey: "k-in" }), null, "India records no fee");
  assert.equal(db.rows.length, 1);
}
assert.doesNotMatch(read("lib/verificationFees.ts"), /status:\s*"paid"/, "fee recorder must never mark paid");

// ---------- 4. Correction windows: working days in market time zone ----------
// Fri 2026-11-06 14:00 London -> 10 working days -> Fri 2026-11-20 end of day London (GMT).
assert.equal(proc.addMarketWorkingDays(at("2026-11-06T14:00:00Z"), 10, LONDON).toISOString(), "2026-11-20T23:59:59.999Z");
// Fri -> 3 working days -> Wed end of day.
assert.equal(proc.addMarketWorkingDays(at("2026-11-06T14:00:00Z"), 3, LONDON).toISOString(), "2026-11-11T23:59:59.999Z");
// Saturday failure: counting starts Monday.
assert.equal(proc.addMarketWorkingDays(at("2026-11-07T10:00:00Z"), 3, LONDON).toISOString(), "2026-11-11T23:59:59.999Z");
// Local date matters: 23:30 UTC Sunday is already Monday in Athens.
assert.equal(proc.addMarketWorkingDays(at("2026-11-08T23:30:00Z"), 1, "Europe/Athens").toISOString(), "2026-11-10T21:59:59.999Z");
// BST: end of local day is 22:59:59.999Z.
assert.equal(proc.addMarketWorkingDays(at("2026-06-01T09:00:00Z"), 1, LONDON).toISOString(), "2026-06-02T22:59:59.999Z");

const first = proc.failureOutcome(1, at("2026-11-06T14:00:00Z"), LONDON);
assert.equal(first.status, "correction");
assert.equal(first.correctionDeadline.toISOString(), "2026-11-20T23:59:59.999Z", "first failure: 10 working days");
const second = proc.failureOutcome(2, at("2026-11-06T14:00:00Z"), LONDON);
assert.equal(second.status, "manual_review");
assert.equal(second.finalEvidenceDeadline.toISOString(), "2026-11-11T23:59:59.999Z", "second failure: final 3 working days");
assert.equal(proc.failureOutcome(3, at("2026-11-06T14:00:00Z"), LONDON).status, "failed", "after final evidence the cycle closes");

const failed1 = { id: "t1", attemptNumber: 1, cyclePosition: 1, status: "correction", failedAt: at("2026-11-06T14:00:00Z"), correctionDeadline: first.correctionDeadline };
const base = { accountVerified: false, activePaidPlan: false, lastSuccessAt: null };
assert.deepEqual(proc.decideVerificationStart({ ...base, attempts: [failed1], now: at("2026-11-20T23:59:59.999Z") }),
  { kind: "new", cyclePosition: 2, charged: false, reason: "correction" }, "correction on the last instant of the window is free");
assert.equal(proc.decideVerificationStart({ ...base, attempts: [failed1], now: at("2026-11-21T00:00:00.000Z") }).charged, true, "after the window a new attempt needs a new fee");
const failed2 = { id: "t2", attemptNumber: 2, cyclePosition: 2, status: "manual_review", failedAt: at("2026-11-06T14:00:00Z"), finalEvidenceDeadline: second.finalEvidenceDeadline };
assert.deepEqual(proc.decideVerificationStart({ ...base, attempts: [failed2, failed1], now: at("2026-11-11T12:00:00Z") }),
  { kind: "new", cyclePosition: 3, charged: false, reason: "final_evidence" });
assert.equal(proc.decideVerificationStart({ ...base, attempts: [failed2, failed1], now: at("2026-11-12T00:00:00Z") }).charged, true);
const failed3 = { id: "t3", attemptNumber: 3, cyclePosition: 3, status: "failed", failedAt: at("2026-11-11T12:00:00Z") };
assert.deepEqual(proc.decideVerificationStart({ ...base, attempts: [failed3, failed2, failed1], now: at("2026-11-11T13:00:00Z") }),
  { kind: "new", cyclePosition: 1, charged: true, reason: "new_attempt_after_failure" });

// No double charge: an open (unfailed) attempt is reused.
assert.deepEqual(proc.decideVerificationStart({ ...base, attempts: [{ id: "open", attemptNumber: 1, cyclePosition: 1, status: "awaiting_payment" }], now: new Date() }),
  { kind: "existing", attemptId: "open" });

// ---------- 5. Free rechecks ----------
const success = at("2026-08-08T10:00:00Z");
const successAttempt = { id: "s", attemptNumber: 1, cyclePosition: 1, status: "successful", completedAt: success };
const day = 24 * 60 * 60 * 1000;
assert.equal(proc.decideVerificationStart({ ...base, attempts: [successAttempt], lastSuccessAt: success, now: new Date(success.getTime() + 90 * day) }).reason, "recheck_90_days", "day 90 is free");
assert.equal(proc.decideVerificationStart({ ...base, attempts: [successAttempt], lastSuccessAt: success, now: new Date(success.getTime() + 90 * day + 1) }).charged, true, "after 90 calendar days a recheck is charged");
assert.equal(proc.decideVerificationStart({ ...base, activePaidPlan: true, attempts: [successAttempt], lastSuccessAt: success, now: new Date(success.getTime() + 400 * day) }).reason, "recheck_paid_plan", "always free on an active paid plan");
const now = at("2026-11-06T12:00:00Z");
assert.equal(proc.hasActivePaidPlan({ subscriptionStatus: "active", subscriptionEndsAt: at("2026-11-07T00:00:00Z") }, now), true);
assert.equal(proc.hasActivePaidPlan({ subscriptionStatus: "active", subscriptionEndsAt: at("2026-11-05T00:00:00Z") }, now), false);
assert.equal(proc.hasActivePaidPlan({ subscriptionStatus: "promotional", subscriptionEndsAt: null }, now), false, "promotional is not a paid plan");

// ---------- 6. Responsible person ----------
const verifiedUser = { id: "u2", accountId: "acc", personVerifiedAt: now };
const companyBase = { accountId: "acc", companyVerificationStatus: "verified", current: { companyName: "Acme Ltd", companyNumber: "01234567", responsibleUserId: "u1" } };
assert.equal(proc.decideCompanySubmission({ ...companyBase, next: { companyName: "ACME LTD", companyNumber: "01234567" }, responsibleUser: verifiedUser }).kind, "responsible_person_change", "same company, new person = free");
assert.equal(proc.decideCompanySubmission({ ...companyBase, next: { companyName: "Other Ltd", companyNumber: "07654321" }, responsibleUser: verifiedUser }).kind, "new_company_relationship", "new company = charged");
assert.equal(proc.decideCompanySubmission({ ...companyBase, next: { companyName: "Acme Ltd", companyNumber: "01234567" }, responsibleUser: { ...verifiedUser, personVerifiedAt: null } }).kind, "reject", "new person must pass ID");
assert.equal(proc.decideCompanySubmission({ ...companyBase, next: { companyName: "Acme Ltd", companyNumber: "01234567" }, responsibleUser: { ...verifiedUser, accountId: "other" } }).kind, "reject", "must be a user of this account");
assert.equal(proc.decideCompanySubmission({ ...companyBase, next: { companyName: "Acme Ltd", companyNumber: "01234567" }, responsibleUser: null }).kind, "reject");
assert.equal(proc.decideCompanySubmission({ ...companyBase, companyVerificationStatus: "not_started", next: { companyName: "Acme Ltd" }, responsibleUser: verifiedUser }).kind, "initial");
assert.equal(proc.isSameCompany({ companyName: "Acme Ltd" }, { companyName: "acme ltd." }), true, "sole traders compare by name");
// A person check for another user on a verified account (needed before naming them) is free.
assert.equal(proc.decideVerificationStart({ ...base, accountVerified: true, attempts: [successAttempt], lastSuccessAt: at("2025-01-01T00:00:00Z"), now }).reason, "responsible_person_change");

// ---------- 7. createVerificationAttempt end to end (Prisma stub) ----------
const verificationSource = read("lib/verification.ts");
const compiled = ts.transpileModule(verificationSource, { compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true } }).outputText;
let qaEnabled = false;
function loadVerification(prisma) {
  const mod = { exports: {} };
  vm.runInNewContext(compiled, { module: mod, exports: mod.exports, Promise, Date, require: (name) => ({
    "@/lib/prisma": { prisma },
    "@/lib/uk": { isUkAccount: (a) => a.country === "GB" && a.currency === "GBP" },
    "@/lib/market": { marketForAccount: (a) => (a.country === "GB" ? { timeZone: LONDON } : null) },
    "@/lib/qaRunnerGuard": { isQaRunnerEnabled: () => qaEnabled },
    "@/lib/verificationProcess": proc,
    "@/lib/verificationFees": fees,
    "@/lib/promotion": { startPromotionForVerifiedAccount: async () => {} },
    "@/lib/referrals": { markReferralVerified: async () => {} },
  })[name] ?? (() => { throw new Error("unexpected dependency " + name); })() });
  return mod.exports;
}
function fakePrisma(account, vehicles = []) {
  const feeDb = memoryFeeDb();
  const attempts = [];
  const prisma = {
    feeDb, attempts, accountUpdates: 0,
    account: { findUnique: async () => account, update: async ({ data }) => { prisma.accountUpdates++; Object.assign(account, data); } },
    verificationAttempt: {
      findMany: async () => [...attempts].sort((a, b) => b.attemptNumber - a.attemptNumber),
      create: async ({ data }) => { const row = { id: "att-" + (attempts.length + 1), ...data }; attempts.push(row); return row; },
    },
    vehicle: { findMany: async () => vehicles },
    verificationFeePayment: feeDb.verificationFeePayment,
    $queryRawUnsafe: async () => [],
    $transaction: async (fn) => fn(prisma),
  };
  return prisma;
}
const ukAccount = (overrides = {}) => ({
  id: "acc", type: "poster", country: "GB", currency: "GBP", verificationStatus: "not_started", phoneVerifiedAt: now,
  isTester: false, qaTestAccounts: [], subscriptionStatus: "inactive", subscriptionEndsAt: null, verifiedAt: null,
  users: [{ id: "u1", role: "owner", emailVerifiedAt: now, personVerifiedAt: null }], ...overrides,
});
{
  const p = fakePrisma(ukAccount({ phoneVerifiedAt: null }));
  await assert.rejects(loadVerification(p).createVerificationAttempt("acc", "u1"), /mobile number/, "server rejects person ID before phone OTP");
  assert.equal(p.attempts.length, 0);
  assert.equal(p.feeDb.rows.length, 0, "no fee recorded when order is violated");
}
{
  const p = fakePrisma(ukAccount({ users: [{ id: "u1", role: "owner", emailVerifiedAt: null, personVerifiedAt: null }] }));
  await assert.rejects(loadVerification(p).createVerificationAttempt("acc", "u1"), /email address/);
}
{
  const p = fakePrisma(ukAccount());
  const lib = loadVerification(p);
  const r1 = await lib.createVerificationAttempt("acc", "u1");
  assert.equal(r1.feeMinorUnits, 250, "poster path records 2.50");
  assert.equal(p.feeDb.rows.length, 1);
  assert.equal(p.feeDb.rows[0].status, "pending");
  assert.equal(r1.attempt.feeStatus, "unpaid");
  const r2 = await lib.createVerificationAttempt("acc", "u1");
  assert.equal(r2.resumed, true, "second start reuses the open attempt");
  assert.equal(p.feeDb.rows.length, 1, "no double charge");
}
{
  const p = fakePrisma(ukAccount({ type: "driver" }), [{ id: "v1" }, { id: "v2" }]);
  const r = await loadVerification(p).createVerificationAttempt("acc", "u1");
  assert.equal(r.feeMinorUnits, 400, "driver-only: 3.50 + 0.50 for second vehicle, no 2.50");
  assert.equal(p.feeDb.rows[0].action, "driver_verification");
  assert.deepEqual(p.feeDb.rows[0].vehicleIds, ["v1", "v2"]);
}
{
  qaEnabled = true;
  const p = fakePrisma(ukAccount({ isTester: true, phoneVerifiedAt: null, qaTestAccounts: [{ runId: "uk-market-student-qa" }],
    users: [{ id: "u1", role: "owner", emailVerifiedAt: null, personVerifiedAt: null }] }));
  const r = await loadVerification(p).createVerificationAttempt("acc", "u1");
  assert.equal(r.feeMinorUnits, 0, "staging UK student pilot: no order gate, no fee");
  qaEnabled = false;
  const p2 = fakePrisma(ukAccount({ isTester: true, phoneVerifiedAt: null, qaTestAccounts: [{ runId: "uk-market-student-qa" }] }));
  await assert.rejects(loadVerification(p2).createVerificationAttempt("acc", "u1"), /mobile number/, "pilot exemption is staging-only");
}
{
  const p = fakePrisma(ukAccount({ country: "IN", currency: "INR" }));
  await assert.rejects(loadVerification(p).createVerificationAttempt("acc", "u1"), /only available to GB \+ GBP/, "India unchanged: no person verification");
  assert.equal(p.attempts.length, 0);
}
assert.equal(loadVerification(fakePrisma(ukAccount())).getVerificationFeeMinorUnits({ type: "poster", country: "IN", currency: "INR" }), 0, "India fee is zero");

// ---------- 8. Static wiring ----------
const startRoute = read("app/api/verification/start/route.ts");
assert.match(startRoute, /createVerificationAttempt\(accountId, userId\)/);
assert.match(startRoute, /ORDER_BLOCK_MESSAGES\.phone_unverified/);
const companyRoute = read("app/api/company-verification/route.ts");
assert.match(companyRoute, /decideCompanySubmission\(/);
assert.match(companyRoute, /!stagingPilotQa && !account\.phoneVerifiedAt/, "company route enforces phone OTP before company");
assert.match(companyRoute, /companyResponsibleUserId: responsibleUserId/);
assert.match(companyRoute, /action: "new_company_relationship"/);
assert.ok(companyRoute.indexOf("isUkAccount(account)") < companyRoute.indexOf("decideCompanySubmission("), "India rejected before company processing");
assert.match(verificationSource, /failureOutcome\(attempt\.cyclePosition/);
assert.doesNotMatch(verificationSource, /addWorkingDays\(now, attempt\.attemptNumber === 1 \? 14 : 7\)/, "old 14/7 windows removed");
assert.doesNotMatch(verificationSource, /return 200/, "old 2.00 fee removed");
assert.match(verificationSource, /await startPromotionForVerifiedAccount\(account\.id\);/, "promotion start call left for builder A");
const schema = read("prisma/schema.prisma");
assert.match(schema, /model VerificationFeePayment \{/);
assert.match(schema, /idempotencyKey String\s+@unique/);
assert.match(schema, /companyResponsibleUserId String\?/);
assert.match(schema, /personVerifiedAt DateTime\?/);
const migration = read("prisma/migrations/20261106030000_verification_process/migration.sql");
assert.match(migration, /CREATE TABLE "VerificationFeePayment"/);
assert.match(migration, /"VerificationFeePayment_idempotencyKey_key"/);

console.log("PASS verification process contract: order, fees per path, no double charge, working-day windows, 90-day and paid-plan rechecks, responsible person, India unchanged, staging pilot preserved.");
