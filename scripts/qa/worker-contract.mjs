#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = p => readFileSync(p, "utf8");
const route = read("app/api/qa/run/route.ts");
const runner = read("lib/qaRunner.ts");
const worker = read("scripts/qa/worker.ts");

assert.match(route, /pg_advisory_xact_lock/,"concurrent API enqueues must serialize at the database");
assert.match(route, /status IN \('queued','running'\)/,"route must detect active durable runs");
assert.match(route, /VALUES\(\$1,\$2,10000,'queued'/,"route must persist a queued run before returning");
assert.match(route, /status: "queued"/,"API must report the durable queued state");
assert.doesNotMatch(route, /void runAndCleanup|void runQA|active = true/,"web handlers must not launch process-local background work");

assert.match(worker, /ORDER BY started_at ASC\s+LIMIT 1\s+FOR UPDATE SKIP LOCKED/,"PostgreSQL locking clause must follow LIMIT");
assert.match(worker, /FOR UPDATE SKIP LOCKED/,"worker must atomically claim one queued row");
assert.match(worker, /SET status = 'running'/,"claim must transition queued to running");
assert.match(worker, /workerHeartbeatAt/,"worker must persist liveness evidence");
assert.match(worker, /runQaWorker\(job\.id, country, workerId, testType, config\)/,"worker must execute the shared QA runner with the claim owner ID");
assert.doesNotMatch(worker, /UPDATE qa_test_runs\s+SET status\s*=\s*'queued'/,"worker must never automatically requeue a potentially live run");
assert.match(worker, /function safeErrorName\(error: unknown\)/,"worker logs must use a safe error-name formatter");
assert.doesNotMatch(worker, /error\\.message|String\\(error\\)/,"worker must not log raw exception messages");
assert.doesNotMatch(worker, /console\\.error\\([^\\n]*,\\s*error\\s*\\)/,"worker must not pass raw caught errors to the logger");

assert.match(runner, /QA_ACCOUNT_COUNT !== "10000"/,"runner preflight must enforce 10k account target");
assert.match(runner, /status='running' AND target_url=\$2 AND target_accounts=\$4 AND summary->>'workerId'=\$3/,"runner must verify the exact worker-owned row");
assert.match(runner, /summary=COALESCE\(summary,'\{\}'::jsonb\) \|\| \$7::jsonb/,"run finalization must preserve worker ownership and heartbeat metadata");
assert.match(runner, /summary->>'workerId'=\$8/,"only the worker that claimed the run may finalize it");
assert.doesNotMatch(runner, /INSERT INTO qa_test_runs/,"runner must not create a duplicate run record");
assert.match(runner, /routeMatrixTarget = testType === "synthetic-accounts" \? 0 : testIterations/,"API-load and workflow runs must use bounded configured iterations; account-only run must not require a route matrix");
assert.match(route, /"api-load", "synthetic-accounts", "workflow-e2e"/,"queue must accept three distinct QA workload types");
assert.match(runner, /accountProvisioningOnly/,"synthetic-account test must stop after account provisioning");
assert.match(runner, /loadRequestCount/,"API-load test must record its 10k request count");
assert.match(runner, /workflow-e2e/,"workflow test mode must remain separately identifiable");

assert.match(route, /WHERE id=\$1 FOR UPDATE/,"cleanup must lock the run row to serialize repeat requests");
assert.match(route, /persistedSummary\.syntheticDataRetained === false/,"cleanup must be idempotent and preserve the first deletion counts");
assert.match(route, /new Set\(\["completed", "failed", "aborted"\]\)/,"cleanup must refuse queued/running active jobs");
assert.match(route, /if \(!run\.finished_at \|\| run\.duration_ms === null\)/,"cleanup must reject interrupted legacy rows without finish metadata");
assert.match(route, /finished_at IS NOT NULL AND duration_ms IS NOT NULL/,"cleanup update must recheck completion metadata in SQL");
console.log("QA durable-worker contract checks passed (static source checks; database concurrency still requires integration testing).");
