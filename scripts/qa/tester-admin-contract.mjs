#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");
const directAdmin = read("app/api/admin/testers/route.ts");
const bridge = read("app/api/internal/admin-bridge/route.ts");
const signup = read("app/api/signup/route.ts");
const jobRoute = read("app/api/jobs/route.ts");
const bidRoute = read("app/api/jobs/[id]/bid/route.ts");

assert.ok(directAdmin.includes('action: "tester_access_code_generated"'), "direct admin code generation must be audited");
assert.ok(directAdmin.includes('action: "tester_application_approved"'), "direct admin approval must be audited");
assert.ok(directAdmin.includes('action: "tester_application_rejected"'), "direct admin rejection must be audited");
assert.ok(directAdmin.includes("await prisma.$transaction(async (tx) => {") && directAdmin.includes("await tx.adminAuditEvent.create"), "direct admin state changes and audit events must be atomic");
assert.ok(directAdmin.includes("reason.length < 5 || reason.length > 1000"), "review decisions must have a bounded, meaningful reason");
assert.ok(directAdmin.includes("market: account.country"), "tester review audit events must include the account market");
assert.ok(directAdmin.includes("plaintextStored: false"), "code audit must record only metadata, never the raw access code");
assert.ok(bridge.includes('action: "tester_application_approved"') && bridge.includes('action: "tester_application_rejected"'), "standalone admin bridge must retain approval/rejection audit events");
assert.ok(signup.includes("claimedAt: null, claimedByAccountId: null") && signup.includes("claim.count !== 1"), "tester codes must remain single-use under concurrent claims");
assert.ok(signup.includes('isTester: isPilotAccess') && signup.includes('testerApprovalStatus: isPilotAccess ? "approved" : testerCodeHash ? "pending" : undefined') && signup.includes("if (validPilotCodeFormat)") && signup.includes("if (!isQaRunnerEnabled())"), "only staging-gated UK QA pilot codes may activate tester privileges; ordinary codes remain pending");
assert.ok(jobRoute.includes("if (!account.isTester && !canPostJobs(account))"), "tester-specific posting exemption must remain explicit");
assert.ok(bidRoute.includes("bidderAccount?.verificationStatus !== \"verified\" && !bidderAccount?.isTester"), "tester-specific bidding exemption must remain explicit");
assert.ok(!directAdmin.includes('verificationStatus: "verified"') && !directAdmin.includes('companyVerificationStatus: "verified"'), "tester approval must never forge identity, company or vehicle verification");

console.log(JSON.stringify({
  status: "passed",
  checks: 13,
  covered: [
    "audited tester code generation",
    "audited approval and rejection",
    "atomic state changes and audit events",
    "required bounded review reason",
    "market recorded",
    "no plaintext code in audit",
    "single-use code claim",
    "approval required before privileges",
    "explicit tester exemptions",
    "no forged verification statuses"
  ]
}, null, 2));
