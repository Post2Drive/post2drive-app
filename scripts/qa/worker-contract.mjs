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

assert.match(worker, /FOR UPDATE SKIP LOCKED/,"worker must atomically claim one queued row");
assert.match(worker, /SET status = 'running'/,"claim must transition queued to running");
assert.match(worker, /workerHeartbeatAt/,"worker must persist liveness evidence");
assert.match(worker, /runQaWorker\(job\.id, country\)/,"worker must execute the shared QA runner");
assert.doesNotMatch(worker, /SET status\s*=\s*'queued'/,"worker must never automatically requeue a potentially live run");

assert.match(runner, /QA_ACCOUNT_COUNT !== "10000"/,"runner preflight must enforce 10k account target");
assert.match(runner, /status='running' AND target_url=\$2 AND target_accounts=10000/,"runner must require a row claimed by the worker");
assert.doesNotMatch(runner, /INSERT INTO qa_test_runs/,"runner must not create a duplicate run record");
assert.match(runner, /routeMatrixTarget = 10_000/,"full API route matrix target must remain exactly 10k");

assert.match(route, /new Set\(\["completed", "failed", "aborted"\]\)/,"cleanup must refuse queued/running active jobs");
assert.match(route, /COALESCE\(finished_at,now\(\)\)/,"cleanup must finalize missing end timestamps");
console.log("QA durable-worker contract checks passed (static source checks; database concurrency still requires integration testing).");
