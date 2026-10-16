#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { isQaRunnerEnabled } from "../../lib/qaRunnerGuard.ts";

const keys = [
  "POST2DRIVE_QA_MODE",
  "POST2DRIVE_QA_ENVIRONMENT",
  "POST2DRIVE_QA_DATABASE_ISOLATED",
  "RAILWAY_ENVIRONMENT_ID",
  "POST2DRIVE_QA_ALLOWED_ENVIRONMENT_ID",
  "QA_BASE_URL",
];
const original = Object.fromEntries(keys.map((key) => [key, process.env[key]]));

function configure(overrides = {}) {
  for (const key of keys) delete process.env[key];
  Object.assign(process.env, {
    POST2DRIVE_QA_MODE: "true",
    POST2DRIVE_QA_ENVIRONMENT: "staging",
    POST2DRIVE_QA_DATABASE_ISOLATED: "true",
    RAILWAY_ENVIRONMENT_ID: "staging-environment-123",
    POST2DRIVE_QA_ALLOWED_ENVIRONMENT_ID: "staging-environment-123",
    QA_BASE_URL: "https://post2drive-web-staging.up.railway.app",
    ...overrides,
  });
}

try {
  configure();
  assert.equal(isQaRunnerEnabled(), true, "valid, allow-listed staging config should enable QA");

  const rejected = [
    ["QA mode disabled", { POST2DRIVE_QA_MODE: "false" }],
    ["production environment", { POST2DRIVE_QA_ENVIRONMENT: "production" }],
    ["database not isolated", { POST2DRIVE_QA_DATABASE_ISOLATED: "false" }],
    ["missing Railway environment ID", { RAILWAY_ENVIRONMENT_ID: "" }],
    ["missing environment allow-list", { POST2DRIVE_QA_ALLOWED_ENVIRONMENT_ID: "" }],
    ["environment mismatch", { POST2DRIVE_QA_ALLOWED_ENVIRONMENT_ID: "other-environment" }],
    ["HTTP URL", { QA_BASE_URL: "http://post2drive-staging.example.test" }],
    ["non-staging host", { QA_BASE_URL: "https://post2drive.example.com" }],
    ["invalid URL", { QA_BASE_URL: "not a URL" }],
  ];
  for (const [label, overrides] of rejected) {
    configure(overrides);
    assert.equal(isQaRunnerEnabled(), false, `${label} must keep QA disabled`);
  }

  const route = readFileSync("app/api/qa/run/route.ts", "utf8");
  const getStart = route.indexOf("export async function GET");
  const postStart = route.indexOf("export async function POST");
  assert.ok(getStart >= 0 && postStart > getStart, "QA GET and POST handlers must exist");
  const getHandler = route.slice(getStart, postStart);
  const guardPosition = getHandler.indexOf("if (!isQaRunnerEnabled())");
  const reportPosition = getHandler.indexOf("if (report)");
  assert.ok(guardPosition >= 0 && reportPosition > guardPosition, "GET staging guard must execute before report/status/run actions");
  assert.ok(getHandler.includes('lastError: lastError ? "QA run failed; inspect restricted staging logs." : null'), "status endpoint must not expose raw internal QA error strings");

  const resendRoute = readFileSync("app/api/email/verification/resend/route.ts", "utf8");
  assert.ok(resendRoute.includes('scope: "email-verification-resend"'), "verification resend must have a network rate limit");
  assert.ok(resendRoute.includes("if (limit) return limit"), "verification resend must enforce its rate limit before processing");
  const verifyRoute = readFileSync("app/api/email/verify/route.ts", "utf8");
  assert.ok(verifyRoute.includes('scope: "email-verification-confirm"'), "verification token attempts must have a network rate limit");
  assert.ok(verifyRoute.includes("if (limit) return limit"), "verification token rate limit must be enforced");

  const authSource = readFileSync("lib/auth.ts", "utf8");
  assert.ok(authSource.includes('scope: "login-network"'), "credential login must be rate-limited by network");
  assert.ok(authSource.includes('scope: "login-email"'), "credential login must be rate-limited by normalized email");
  assert.ok(authSource.includes("if (!networkLimit.allowed || !emailLimit.allowed) return null"), "credential login must reject over-limit attempts");
  assert.ok(authSource.includes("Login rate-limit control unavailable."), "login throttling must fail closed without logging raw errors");

  console.log(JSON.stringify({
    status: "passed",
    checks: rejected.length + 12,
    covered: ["valid staging allow-list", ...rejected.map(([label]) => label), "GET guard before sensitive operations", "raw QA errors not returned", "GET and POST handlers present", "resend endpoint rate-limited", "verification token endpoint rate-limited", "login network/email rate limits", "login throttling fails closed"]
  }, null, 2));
} finally {
  for (const [key, value] of Object.entries(original)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}
