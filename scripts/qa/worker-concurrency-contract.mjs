#!/usr/bin/env node
// Race two real worker processes against one durable queued run on CI PostgreSQL.
// Both workers must be polling before the row is inserted, so the test covers
// competing claims rather than merely starting one worker after the other finished.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import { randomUUID } from "node:crypto";
import { hostname } from "node:os";
import { PrismaClient } from "@prisma/client";

assert.equal(process.env.CI, "true", "worker concurrency contract must run only in CI");
const databaseUrl = process.env.DATABASE_URL || "";
const parsed = new URL(databaseUrl);
assert.ok(["localhost", "127.0.0.1"].includes(parsed.hostname), "concurrency contract must use local CI PostgreSQL");
assert.equal(parsed.port || "5432", "5432", "concurrency contract must use the CI database port");

const prisma = new PrismaClient();
const runId = "qa-worker-race-" + randomUUID();
const fakeTarget = "https://qa-worker-race.invalid";
const children = [];
let rowInserted = false;
let watchdogs = [];

const wait = ms => new Promise(resolve => setTimeout(resolve, ms));
const readSummary = value => {
  if (value && typeof value === "object") return value;
  if (typeof value === "string") {
    try { return JSON.parse(value); } catch {}
  }
  return {};
};

function startWorker(index) {
  const env = {
    ...process.env,
    POST2DRIVE_QA_MODE: "true",
    POST2DRIVE_QA_ENVIRONMENT: "staging",
    POST2DRIVE_QA_DATABASE_ISOLATED: "true",
    RAILWAY_ENVIRONMENT_ID: "ci-qa-worker-race",
    POST2DRIVE_QA_ALLOWED_ENVIRONMENT_ID: "ci-qa-worker-race",
    QA_BASE_URL: "https://post2drive-web-staging.example.test",
    QA_ACCOUNT_COUNT: "10000",
    QA_MARKET_COUNTRY: "GB",
    QA_WORKER_POLL_MS: "50",
    QA_WORKER_HEARTBEAT_MS: "500",
  };
  const child = spawn(process.execPath, [
    "--experimental-default-type=module",
    "--experimental-strip-types",
    "scripts/qa/worker.ts",
  ], { env, stdio: ["ignore", "pipe", "pipe"] });
  const record = { index, child, output: "", errorOutput: "" };
  child.stdout.setEncoding("utf8");
  child.stderr.setEncoding("utf8");
  child.stdout.on("data", chunk => { record.output += chunk; });
  child.stderr.on("data", chunk => { record.errorOutput += chunk; });
  children.push(record);
  return record;
}

async function waitFor(predicate, message, timeoutMs = 8000) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await predicate();
    if (value) return value;
    if (children.some(({ child }) => child.exitCode !== null || child.signalCode !== null)) {
      const dead = children.filter(({ child }) => child.exitCode !== null || child.signalCode !== null)
        .map(({ index, child }) => ({ index, pid: child.pid, exitCode: child.exitCode, signalCode: child.signalCode }));
      assert.fail(message + "; a worker exited early: " + JSON.stringify(dead));
    }
    await wait(50);
  }
  assert.fail(message + "; timed out waiting for the condition");
}

try {
  startWorker(1);
  startWorker(2);

  await waitFor(
    async () => children.every(({ output }) => output.includes("Post2Drive staging QA worker started")),
    "both workers must boot and poll before the queue row is inserted",
  );

  await prisma.$executeRawUnsafe(
    "INSERT INTO qa_test_runs(id,target_url,target_accounts,status,summary) VALUES($1,$2,10000,'queued',$3::jsonb)",
    runId,
    fakeTarget,
    JSON.stringify({ status: "queued", country: "GB", phase: "queued" }),
  );
  rowInserted = true;

  const failedRow = await waitFor(async () => {
    const rows = await prisma.$queryRawUnsafe(
      "SELECT id,status,finished_at,duration_ms,summary FROM qa_test_runs WHERE id=$1",
      runId,
    );
    return rows[0]?.status === "failed" ? rows[0] : null;
  }, "one worker must claim the queued run and fail closed on target mismatch");

  assert.ok(failedRow.finished_at, "worker failure must be finalized with finished_at");
  assert.notEqual(failedRow.duration_ms, null, "worker failure must persist duration_ms");
  const summary = readSummary(failedRow.summary);
  assert.equal(summary.phase, "worker-failed", "the sole claimed run must persist its terminal failure phase");
  assert.ok(summary.workerId, "the claim must persist a worker owner identifier");
  assert.ok(summary.workerHeartbeatAt, "the claim must persist heartbeat metadata");

  const matchingWorkers = children.filter(({ child }) =>
    typeof child.pid === "number" &&
    String(summary.workerId).startsWith(`${hostname()}-${child.pid}-`),
  );
  assert.equal(matchingWorkers.length, 1, "exactly one of the competing worker processes must own the run");

  // A second claim of the same row would emit the target-mismatch failure twice.
  // Because both consumers were polling before enqueue, one occurrence proves only
  // one process crossed the atomic queued -> running transition for this test job.
  const mismatch = /Claimed QA run did not match worker target\/count\./g;
  const mismatchCount = children.reduce(
    (count, record) => count + (record.errorOutput.match(mismatch) || []).length,
    0,
  );
  assert.equal(mismatchCount, 1, "the queued run must be claimed and executed exactly once across two workers");
  assert.ok(children.every(({ output }) => output.includes("Post2Drive staging QA worker started")),
    "both competing consumers must stay healthy while one owns the job");
  console.log("QA two-worker PostgreSQL claim concurrency contract passed.");
} catch (error) {
  console.error("QA worker concurrency integration contract failed.");
  for (const record of children) {
    console.error(`worker ${record.index} stdout:\n${record.output.slice(-3000)}`);
    console.error(`worker ${record.index} stderr:\n${record.errorOutput.slice(-3000)}`);
  }
  throw error;
} finally {
  for (const timer of watchdogs) clearTimeout(timer);
  for (const { child } of children) {
    if (child.exitCode === null && child.signalCode === null) child.kill("SIGTERM");
  }
  for (const { child } of children) {
    if (child.exitCode === null && child.signalCode === null) {
      await Promise.race([once(child, "exit"), wait(3000)]);
    }
    if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
  }
  if (rowInserted) {
    await prisma.$executeRawUnsafe("DELETE FROM qa_test_events WHERE run_id=$1", runId).catch(() => {});
    await prisma.$executeRawUnsafe("DELETE FROM qa_test_accounts WHERE run_id=$1", runId).catch(() => {});
    await prisma.$executeRawUnsafe("DELETE FROM qa_test_runs WHERE id=$1", runId).catch(() => {});
  }
  await prisma.$disconnect();
}
