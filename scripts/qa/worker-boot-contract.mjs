#!/usr/bin/env node
// Exercise the real worker entrypoint and atomic claim on the isolated PostgreSQL
// service created by GitHub Actions. The queued row uses a deliberately mismatched
// .invalid target, so the worker must mark it failed before any HTTP traffic occurs.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "@prisma/client";

const databaseUrl = process.env.DATABASE_URL || "";
assert.equal(process.env.CI, "true", "worker integration contract must run only in CI");
const parsed = new URL(databaseUrl);
assert.ok(["localhost", "127.0.0.1"].includes(parsed.hostname), "worker integration must use local CI PostgreSQL");
assert.equal(parsed.port || "5432", "5432", "worker integration must use the CI database port");

const prisma = new PrismaClient();
const runId = "qa-worker-contract-" + randomUUID();
const fakeTarget = "https://qa-worker-contract.invalid";
let child;
let output = "";
let errorOutput = "";
let watchdog;
let rowInserted = false;

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const readSummary = value => {
  if (value && typeof value === "object") return value;
  if (typeof value === "string") {
    try { return JSON.parse(value); } catch {}
  }
  return {};
};

try {
  await prisma.$executeRawUnsafe(
    "INSERT INTO qa_test_runs(id,target_url,target_accounts,status,summary) VALUES($1,$2,10000,'queued',$3::jsonb)",
    runId, fakeTarget, JSON.stringify({ status: "queued", country: "GB", phase: "queued" }),
  );
  rowInserted = true;

  const env = {
    ...process.env,
    POST2DRIVE_QA_MODE: "true",
    POST2DRIVE_QA_ENVIRONMENT: "staging",
    POST2DRIVE_QA_DATABASE_ISOLATED: "true",
    RAILWAY_ENVIRONMENT_ID: "ci-qa-worker-contract",
    POST2DRIVE_QA_ALLOWED_ENVIRONMENT_ID: "ci-qa-worker-contract",
    QA_BASE_URL: "https://post2drive-web-staging.example.test",
    QA_ACCOUNT_COUNT: "10000",
    QA_MARKET_COUNTRY: "GB",
    QA_WORKER_POLL_MS: "100",
    QA_WORKER_HEARTBEAT_MS: "1000",
  };
  child = spawn(process.execPath, [
    "--experimental-default-type=module",
    "--experimental-strip-types",
    "scripts/qa/worker.ts",
  ], { env, stdio: ["ignore", "pipe", "pipe"] });
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", chunk => { output += chunk; });
  child.stderr.on("data", chunk => { errorOutput += chunk; });

  watchdog = setTimeout(() => child?.kill("SIGKILL"), 10_000);
  const deadline = Date.now() + 8_000;
  let failedRow = null;
  while (Date.now() < deadline) {
    const rows = await prisma.$queryRawUnsafe(
      "SELECT id,status,finished_at,duration_ms,summary FROM qa_test_runs WHERE id=$1",
      runId,
    );
    failedRow = rows[0] || null;
    if (failedRow?.status === "failed") break;
    if (child.exitCode !== null || child.signalCode !== null) break;
    await wait(100);
  }

  assert.ok(output.includes("Post2Drive staging QA worker started"), "worker must boot using Node's native TypeScript/ESM runtime");
  assert.equal(failedRow?.status, "failed", "worker must atomically claim the queued test row and fail closed on target mismatch");
  assert.ok(failedRow?.finished_at, "worker failure must be finalized with finished_at");
  assert.notEqual(failedRow?.duration_ms, null, "worker failure must persist duration_ms");
  const summary = readSummary(failedRow?.summary);
  assert.equal(summary.phase, "worker-failed", "worker must persist its terminal failure phase");
  assert.ok(summary.workerId, "worker claim must persist an owner identifier");
  assert.ok(summary.workerHeartbeatAt, "worker claim must persist heartbeat metadata");
  assert.ok(!output.includes("qa-worker-contract.invalid") || output.includes("Claimed QA run did not match"), "test target must be rejected before any HTTP traffic");
  console.log("QA worker runtime/atomic-claim integration contract passed.");
} catch (error) {
  console.error("QA worker integration contract failed.");
  console.error(output.slice(-4000));
  console.error(errorOutput.slice(-4000));
  throw error;
} finally {
  if (watchdog) clearTimeout(watchdog);
  if (child && child.exitCode === null && child.signalCode === null) {
    child.kill("SIGTERM");
    await Promise.race([once(child, "exit"), wait(3000)]);
    if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
  }
  if (rowInserted) {
    await prisma.$executeRawUnsafe("DELETE FROM qa_test_events WHERE run_id=$1", runId).catch(() => {});
    await prisma.$executeRawUnsafe("DELETE FROM qa_test_accounts WHERE run_id=$1", runId).catch(() => {});
    await prisma.$executeRawUnsafe("DELETE FROM qa_test_runs WHERE id=$1", runId).catch(() => {});
  }
  await prisma.$disconnect();
}
