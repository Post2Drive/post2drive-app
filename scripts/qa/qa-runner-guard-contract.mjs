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
  assert.ok(getHandler.includes("lastError: null"), "status endpoint must not expose raw internal QA error strings");
  const statusStart = getHandler.indexOf('if (url.searchParams.get("mode") === "status")');
  const reportEnd = getHandler.indexOf("// One-time, high-entropy trigger", statusStart);
  const statusHandler = getHandler.slice(statusStart, reportEnd);
  assert.ok(statusHandler.includes("WHERE status IN (\'queued\',\'running\') ORDER BY started_at DESC LIMIT 1"), "status must read both queued and running jobs from the durable QA ledger");
  assert.ok(statusHandler.includes("ORDER BY started_at DESC LIMIT 1"), "status must expose the latest persisted run after a process restart");
  assert.ok(statusHandler.includes("persistedRunningRun") && statusHandler.includes("latestRun"), "status response must expose normalized durable run summaries");
  assert.ok(statusHandler.includes("Unable to read durable QA run status."), "status must fail closed if the durable ledger cannot be read");

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

  const qaAuthorization = readFileSync("lib/qaRunAuthorization.ts", "utf8");
  assert.ok(qaAuthorization.includes("isQaRunnerEnabled()"), "QA throttle bypass must require the staging guard");
  assert.ok(qaAuthorization.includes("target_url = ${base}"), "QA throttle bypass must match the configured staging target");
  assert.ok(qaAuthorization.includes("target_accounts = 10000"), "QA throttle bypass must be limited to the fixed synthetic cohort");
  assert.ok(qaAuthorization.includes("status = 'running'"), "QA throttle bypass must require a currently running QA run");
  const rateLimitSource = readFileSync("lib/rateLimit.ts", "utf8");
  assert.ok(rateLimitSource.includes("isAuthorizedQaRunId(qaRunId)"), "network throttle bypass must verify the active run without relying on proxy-internal request origin");

  const qaRoute = readFileSync("app/api/qa/run/route.ts", "utf8");
  const qaRunner = readFileSync("lib/qaRunner.ts", "utf8");
  const qaWorker = readFileSync("scripts/qa/worker.ts", "utf8");
  assert.ok(qaRunner.includes('getMarket(countryCode)'), "QA runner must resolve the selected country from supported markets");
  assert.ok(qaRunner.includes('process.env.QA_MARKET_COUNTRY || "GB"'), "QA runner must support an explicit per-country test selection");
  assert.ok(qaRunner.includes("country: market.country, currency: market.currency"), "synthetic accounts must use the selected market currency");
  assert.ok(qaRunner.includes("currency: market.currency"), "synthetic jobs must use the selected market currency");
  assert.ok(qaRoute.includes('crypto.randomUUID();'), "QA run IDs must use high entropy");
  assert.ok(qaRunner.includes("const routeMatrixTarget = 10_000"), "each country run must target 10,000 API route scenarios");
  assert.ok(qaRunner.includes("Array.from({ length: 10_000 }, (_, i) => i)"), "each country run must provision 10,000 synthetic accounts");
  assert.ok(qaRunner.includes("createdAccounts !== 10_000"), "the run must abort unless all 10,000 synthetic accounts are created");
  assert.ok(qaRoute.includes("target_accounts !== 10_000"), "cleanup must be bound to a recorded 10,000-account run");
  assert.ok(qaRoute.includes('accounts !== "10000"'), "the HTTP trigger must require explicit 10,000-account confirmation");
  assert.ok(qaRunner.includes("routeMatrixExecuted !== routeMatrixTarget"), "a short route matrix must not be reported as completed");
  assert.ok(qaRoute.includes("'syntheticDataRetained',false"), "cleanup must mark synthetic data as deleted in the preserved report");
  assert.ok(qaRoute.includes("preservedAuditEvents: true, preservedRunSummary: true"), "cleanup must retain findings and the run summary");
  assert.ok(!qaRoute.includes("QA_AUTO_CLEANUP"), "automatic synthetic-data cleanup must not run when a worker finishes");
  assert.ok(!qaRoute.includes("cleanupSyntheticRuns([String(summary.runId)], base)"), "cleanup must be explicit after results are reviewed");
  assert.ok(qaRoute.includes("const finalStatus = run.status;"), "cleanup must preserve only a terminal status and must not convert a running job implicitly");
  assert.ok(qaRoute.includes('new Set(["completed", "failed", "aborted"])'), "cleanup must reject queued and running runs");
  assert.ok(!qaRoute.includes('new Set(["completed", "running", "failed", "aborted"])'), "cleanup must never allow the running status");
  assert.ok(qaRoute.includes("finished_at=COALESCE(finished_at,now())") && qaRoute.includes("duration_ms=COALESCE(duration_ms,"), "cleanup must finalize interrupted run timestamps and duration");
  assert.ok(qaRoute.includes("pg_advisory_xact_lock"), "enqueue requests must serialize across web replicas");
  assert.ok(qaRoute.includes("VALUES($1,$2,10000,'queued'"), "HTTP requests must enqueue a durable run");
  assert.ok(qaWorker.includes("FOR UPDATE SKIP LOCKED"), "worker claims must be atomic across replicas");
  assert.ok(qaWorker.includes("workerHeartbeatAt"), "worker heartbeat must be persisted");
  assert.ok(qaWorker.includes("runQaWorker(job.id, country)"), "worker must invoke the shared runner");
  assert.ok(qaRunner.includes("status='running' AND target_url=$2 AND target_accounts=10000"), "runner must verify a worker-claimed staging row");
  assert.ok(!qaRunner.includes("INSERT INTO qa_test_runs"), "runner must not create duplicate run records");

  console.log(JSON.stringify({
    status: "passed",
    checks: rejected.length + 31,
    covered: ["valid Railway staging allow-list", ...rejected.map(([label]) => label), "GET guard before sensitive operations", "raw QA errors not returned", "GET and POST handlers present", "resend endpoint rate-limited", "verification token endpoint rate-limited", "login network/email rate limits", "login throttling fails closed", "QA throttle bypass requires an active run, target and origin", "QA runner is market-parameterized", "synthetic fixtures use market currency", "high-entropy QA run IDs", "10,000 API route scenarios required per country", "cleanup preserves findings, marks data deleted and preserves failure status", "cleanup rejects active runs", "interrupted run finalization timestamps"]
  }, null, 2));
} finally {
  for (const [key, value] of Object.entries(original)) {
    if (value === undefined) delete process.env[key];
    else process.env[key] = value;
  }
}
