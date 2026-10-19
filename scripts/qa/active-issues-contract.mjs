#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const route = readFileSync("app/api/admin/performance/route.ts", "utf8");
const dashboard = readFileSync("app/admin/performance/performance-dashboard.tsx", "utf8");
const queryStart = route.indexOf("WITH recent_events AS (");
assert.ok(queryStart >= 0, "performance API must define the active QA issues query");
const queryEnd = route.indexOf("\n        LIMIT 100\n", queryStart);
assert.ok(queryEnd > queryStart, "active QA issues query must cap the displayed issue list at exactly 100 rows");
const query = route.slice(queryStart, queryEnd + "\n        LIMIT 100".length);

assert.ok(query.includes("WHERE r.status IN ('completed', 'failed')"), "only finalized QA runs may resolve an issue");
assert.ok(query.includes("e.method"), "issue identity must include HTTP method");
assert.ok(query.includes("e.method,") && query.includes('SELECT "runId", country, "runStatus", scenario, action, method, path'), "HTTP method must be projected out of the CTE for the final SELECT");
assert.ok(query.includes("e.path"), "issue identity must include route");
assert.ok(query.includes("e.expected_statuses"), "issue identity must include expected status set");
assert.ok(query.includes("ORDER BY r.started_at DESC, e.created_at DESC, e.id DESC"), "latest finalized check must win deterministically");
assert.ok(query.includes("WHERE issue_rank=1 AND passed=false"), "only the latest failed outcome remains active");
assert.ok(!query.includes("e.run_id IN (SELECT id FROM qa_test_runs ORDER BY started_at DESC LIMIT 100)"), "older unresolved issues must not disappear just because their run left the recent-runs window");
assert.ok(query.includes('SELECT "runId", country, "runStatus", scenario, action, method, path'), "active issue response must include HTTP method for diagnosis");
assert.ok(dashboard.includes('{key:"method",label:"Method"}'), "active issues table must display the HTTP method");
assert.ok(dashboard.includes("Skipped or missing checks do not clear it"), "dashboard must explain that skipped or missing checks do not resolve issues");

console.log("Active QA issue resolution contract passed.");
