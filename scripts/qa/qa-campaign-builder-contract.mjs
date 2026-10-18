#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const route = readFileSync("app/api/admin/qa-campaigns/route.ts", "utf8");
const page = readFileSync("app/admin/qa-campaigns/page.tsx", "utf8");
const builder = readFileSync("app/admin/qa-campaigns/qa-campaign-builder.tsx", "utf8");
const migration = readFileSync("prisma/migrations/20261019100000_qa_campaign_builder/migration.sql", "utf8");

assert.ok(route.includes("getServerSession(authOptions)") && route.includes("isTesterAdmin()"), "campaign API must require an authenticated allow-listed tester admin");
assert.ok(route.includes("target_environment text NOT NULL DEFAULT 'staging'") || migration.includes("target_environment text NOT NULL DEFAULT 'staging'"), "campaign metadata must be staging-scoped");
assert.ok(migration.includes("CHECK (target_environment = 'staging')"), "database must reject non-staging campaign targets");
assert.ok(migration.includes("CHECK (execution_mode = 'preview_only')"), "database must reject campaign execution mode until runner orchestration is reviewed");
assert.ok(migration.includes("CHECK (status = 'draft')"), "campaign metadata may only be persisted as drafts in this phase");
assert.ok(route.includes("int(body?.totalCampaignTests, 1, 25000)") && route.includes("int(body?.accountCount, 1, 10000)") && route.includes("int(body?.concurrency, 1, 100)"), "API must cap test volume, account count and concurrency");
assert.ok(route.includes("MAX_VARIATIONS = 20"), "API must cap the number of variations");
assert.ok(route.includes("variations.length * testsPerVariation > totalCampaignTests"), "API must reject variation allocation above the campaign test budget");
assert.ok(route.includes("executionEnabled: false") && route.includes("executionMode: \"preview_only\""), "API must communicate that execution is disabled");
assert.ok(route.includes("FROM qa_test_runs ORDER BY started_at DESC LIMIT 50") && route.includes("FROM qa_test_campaigns ORDER BY created_at DESC LIMIT 100"), "reporting must keep campaign drafts separate from preserved execution history");
assert.ok(route.includes("durationMs: run.durationMs === null ? null : Number(run.durationMs)"), "reporting must normalize PostgreSQL bigint durations for JSON");
assert.ok(builder.includes("Save campaign draft") && builder.includes("no QA run was queued"), "UI must distinguish saving a draft from launching a run");
assert.ok(builder.includes("Synthetic account count") && builder.includes("Tests per variation") && builder.includes("Total campaign tests") && builder.includes("Concurrency target"), "UI must expose distinct volume controls");
assert.ok(builder.includes("Add variation") && builder.includes("Remove"), "variations must be editable");
assert.ok(page.includes("isTesterAdmin()"), "campaign page must enforce admin access");
assert.ok(!route.includes("enqueueQaRun("), "draft API must not enqueue QA runs");
assert.ok(!route.includes("DELETE FROM qa_test_runs") && !route.includes("DELETE FROM qa_test_events") && !route.includes("DELETE FROM qa_test_accounts"), "campaign API must not modify or clean existing QA history");

console.log(JSON.stringify({status:"passed",checks:17,covered:["admin access","staging-only database constraint","preview-only persistence","draft-only status","bounded workload configuration","variation allocation validation","separate test/account/concurrency controls","no run enqueueing","no QA history deletion"]},null,2));
