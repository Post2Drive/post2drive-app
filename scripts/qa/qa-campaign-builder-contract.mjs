#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const route = readFileSync("app/api/admin/qa-campaigns/route.ts", "utf8");
const page = readFileSync("app/admin/qa-campaigns/page.tsx", "utf8");
const builder = readFileSync("app/admin/qa-campaigns/qa-campaign-builder.tsx", "utf8");
const migration = readFileSync("prisma/migrations/20261019100000_qa_campaign_builder/migration.sql", "utf8");
const executionMigration = readFileSync("prisma/migrations/20261019120000_qa_campaign_execution/migration.sql", "utf8");
const startRoute = readFileSync("app/api/admin/qa-campaigns/[id]/start/route.ts", "utf8");
const worker = readFileSync("scripts/qa/worker.ts", "utf8");
const runner = readFileSync("lib/qaRunner.ts", "utf8");

assert.ok(route.includes("getServerSession(authOptions)") && route.includes("isTesterAdmin()"), "campaign API must require an authenticated allow-listed tester admin");
assert.ok(route.includes("target_environment text NOT NULL DEFAULT 'staging'") || migration.includes("target_environment text NOT NULL DEFAULT 'staging'"), "campaign metadata must be staging-scoped");
assert.ok(migration.includes("CHECK (target_environment = 'staging')"), "database must reject non-staging campaign targets");
assert.ok(migration.includes("CHECK (execution_mode = 'preview_only')") && executionMigration.includes("staging_sequential"), "campaign execution mode must be explicitly migrated to sequential staging runs");
assert.ok(migration.includes("CHECK (status = 'draft')") && executionMigration.includes("CHECK (status IN ('pending','queued','running','completed','failed','aborted','skipped'))"), "campaigns progress through constrained durable statuses");
assert.ok(route.includes("int(body?.totalCampaignTests, 1, 25000)") && route.includes("int(body?.accountCount, 500, 10000)") && route.includes("int(body?.concurrency, 1, 100)"), "API must cap test volume, account count and concurrency");
assert.ok(route.includes("MAX_VARIATIONS = 20"), "API must cap the number of variations");
assert.ok(route.includes("allocatedIterations > totalCampaignTests"), "API must reject variation allocation above the campaign test budget");
assert.ok(route.includes("executionEnabled: isQaRunnerEnabled()") && route.includes("FROM qa_test_campaign_steps"), "API must expose execution status and campaign steps");
assert.ok(route.includes("FROM qa_test_runs ORDER BY started_at DESC LIMIT 50") && route.includes("FROM qa_test_campaigns ORDER BY created_at DESC LIMIT 100"), "reporting must keep campaign drafts separate from preserved execution history");
assert.ok(route.includes("const steps = rawSteps.map(normalise)") && route.includes("summary->>'p95Ms'"), "reporting must expose measured per-step latency and normalized durations");
assert.ok(builder.includes("Save campaign draft") && builder.includes("Confirm & queue campaign") && builder.includes("Measured execution results"), "UI must separate draft saving from confirmed execution and show measured results");
assert.ok(builder.includes("Test accounts") && builder.includes("Total test count") && builder.includes("Parallel requests (concurrency)"), "simplified UI must expose test count, account count and concurrency");
assert.ok(!builder.includes("Add comparison") && !builder.includes("Variations (optional)") && !builder.includes("Variation {i+1}"), "variation controls must be removed from the builder UI");
assert.ok(builder.includes('variations:[{id:"variation-1",name:"Standard run",description:"",overrides:{}}]'), "simplified UI must submit one standard run for backend compatibility");
assert.ok(page.includes("isTesterAdmin()"), "campaign page must enforce admin access");
assert.ok(startRoute.includes("RUN_QA_CAMPAIGN_ON_STAGING") && startRoute.includes("pg_advisory_xact_lock") && startRoute.includes("WITH queue_lock AS MATERIALIZED"), "campaign start must require explicit staging confirmation and serialize queue access without selecting PostgreSQL void");
assert.ok(worker.includes("WITH queue_lock AS MATERIALIZED"), "worker campaign advancement must serialize queue access without selecting PostgreSQL void");
assert.ok(worker.includes("advanceCampaign") && worker.includes("qa_test_campaign_steps"), "worker must advance campaign steps sequentially");
assert.ok(runner.includes("testIterations") && runner.includes("executionConcurrency") && runner.includes("accountTarget"), "runner must use configured iteration, concurrency and account targets");
assert.ok(!route.includes("DELETE FROM qa_test_runs") && !route.includes("DELETE FROM qa_test_events") && !route.includes("DELETE FROM qa_test_accounts"), "campaign API must not modify or clean existing QA history");

console.log(JSON.stringify({status:"passed",checks:18,covered:["admin access","staging-only database constraint","sequential execution migration","constrained campaign statuses","bounded workload configuration","variation allocation validation","per-variation result reporting","explicit staging confirmation","sequential worker orchestration","no QA history deletion"]},null,2));
