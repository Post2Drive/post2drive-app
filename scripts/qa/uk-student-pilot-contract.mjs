import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const pilotAccess = read("../../lib/pilotAccess.ts");
const signup = read("../../app/api/signup/route.ts");
const auth = read("../../lib/auth.ts");
const signupPage = read("../../app/signup/page.tsx");
const testerAdmin = read("../../app/api/admin/testers/route.ts");
const bid = read("../../app/api/jobs/[id]/bid/route.ts");
const directAccept = read("../../app/api/jobs/[id]/accept/route.ts");
const feedback = read("../../app/api/pilot/feedback/route.ts");
const diagnostics = read("../../lib/pilotDiagnostics.ts");
const launcher = read("../../app/components/pilot-feedback-launcher.tsx");
const feedbackPage = read("../../app/pilot-feedback/page.tsx");
const adminPage = read("../../app/admin/pilot/page.tsx");

assert.match(pilotAccess, /isQaRunnerEnabled\(\)/);
assert.match(pilotAccess, /isUkAccount\(market\)/);
assert.match(pilotAccess, /P2D-PILOT-\[A-F0-9\]\{24\}/);
assert.match(pilotAccess, /timingSafeEqual/);
assert.match(pilotAccess, /expiresAt <= Date\.now\(\)/);
assert.match(pilotAccess, /orderBy: \{ createdAt: "desc" \}/);

assert.match(testerAdmin, /body\.action === "generate-pilot-code"/);
assert.match(testerAdmin, /if \(!isQaRunnerEnabled\(\)\)/);
assert.match(testerAdmin, /codeHash: hashPilotAccessCode\(rawCode\)/);
assert.match(testerAdmin, /plaintextStored: false/);

assert.match(signup, /validateSharedUkPilotCode\(suppliedTesterCode, \{ country, currency \}\)/);
assert.match(signup, /isTester: isPilotAccess/);
assert.match(signup, /tx\.qaTestAccount\.create/);
assert.match(signup, /runId: "uk-student-pilot"/);
assert.match(signup, /testerApprovalStatus: isPilotAccess \? "approved"/);
assert.match(signup, /emailVerifiedAt: isPilotAccess/);
assert.match(signup, /looksLikeSharedPilotCode/);
assert.match(signup, /invalid, expired, or is not available in this staging environment/);
assert.match(auth, /allowedStagingPilotLogin/);
assert.match(auth, /isQaRunnerEnabled/);
assert.match(signup, /if \(testerCodeHash && !isPilotAccess\)/);
assert.match(signup, /emailVerificationPending: verificationRequired && !isPilotAccess/);
assert.doesNotMatch(signup, /verificationStatus:\s*"verified"/);

assert.match(signupPage, /UK student pilot \/ tester code/);
assert.match(signupPage, /Tester mode skips real identity, company and vehicle eligibility checks/);
assert.match(bid, /!bidderAccount\.isTester && bidderAccount\.type !== "driver"/);
assert.match(directAccept, /!account\.isTester && account\.type !== "driver"/);

assert.match(feedback, /if \(!isQaRunnerEnabled\(\)\)/);
assert.match(feedback, /!account\.isTester \|\| !isUkAccount\(account\)/);
assert.match(feedback, /enforceRateLimit\(req, \{ scope: "pilot-feedback"/);
assert.match(feedback, /body\.consent !== true/);
assert.match(feedback, /diagnosticsOnly\(body\.diagnostics\)/);
assert.match(feedback, /action: "pilot_feedback_submitted"/);
assert.match(diagnostics, /horizontalOverflowPx/);
assert.match(diagnostics, /devicePixelRatio/);
assert.match(diagnostics, /safeAreaTop/);
assert.match(diagnostics, /function safeRoute/);
assert.match(launcher, /collectPilotDiagnostics\(\)/);
assert.match(launcher, /PILOT_DIAGNOSTICS_STORAGE_KEY/);
assert.match(feedbackPage, /I agree to send this report and the technical diagnostics/);
assert.match(feedbackPage, /does not upload screenshots/);
assert.match(adminPage, /!isQaRunnerEnabled\(\)/);
assert.match(adminPage, /pilot_feedback_submitted/);

console.log("UK student pilot access, bypass boundaries, privacy and layout-diagnostics contract passed.");
