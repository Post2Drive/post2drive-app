import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const phoneSource = readFileSync("lib/phoneVerification.ts", "utf8");
const qaGuardSource = readFileSync("lib/qaRunnerGuard.ts", "utf8");

assert.ok(phoneSource.includes("const E164_PATTERN") && phoneSource.includes("{7,14}"), "phone input must use bounded E.164 validation");
assert.ok(phoneSource.includes('phone.startsWith("+44")'), "UK numbers must route by +44 calling code");
assert.ok(phoneSource.includes('phone.startsWith("+91")'), "India numbers must route by +91 calling code");
assert.ok(phoneSource.includes("POST2DRIVE_SMS_UK_PROVIDER"), "UK provider selection must be independent");
assert.ok(phoneSource.includes("POST2DRIVE_SMS_INDIA_PROVIDER"), "India provider selection must be independent");
assert.ok(phoneSource.includes("POST2DRIVE_SMS_GLOBAL_PROVIDER"), "all other configured markets must have a separate global provider slot");
assert.ok(phoneSource.includes("Object.values(MARKETS)"), "global routing must be limited to configured market calling codes");
assert.ok(phoneSource.includes('providerName ? "provider-adapter-not-integrated" : "provider-selection-required"'), "provider configuration must not falsely imply a working adapter");
assert.ok(phoneSource.includes('process.env.POST2DRIVE_STAGING_TEST_PHONE_VERIFICATION === "true"'), "staging test mode must require explicit opt-in");
assert.ok(phoneSource.includes("isQaRunnerEnabled()"), "staging test mode must use the shared isolated QA guard");
assert.ok(qaGuardSource.includes('process.env.POST2DRIVE_QA_ENVIRONMENT !== "staging"'), "QA guard must reject non-staging environments");
assert.ok(qaGuardSource.includes('process.env.POST2DRIVE_QA_DATABASE_ISOLATED !== "true"'), "QA guard must require isolated database declaration");
assert.ok(qaGuardSource.includes("environmentId !== allowedEnvironmentId"), "QA guard must require the allow-listed runtime environment");
assert.ok(qaGuardSource.includes('url.protocol !== "https:"'), "QA guard must require HTTPS");
assert.ok(!phoneSource.includes("sendSms("), "routing module must not pretend to send SMS");
assert.ok(!phoneSource.includes("emailVerifiedAt"), "phone routing must not mark email as verified");

console.log(JSON.stringify({ status: "passed", checks: 14 }, null, 2));