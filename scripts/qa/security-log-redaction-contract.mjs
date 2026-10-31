import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const qaRunner = readFileSync("lib/qaRunner.ts", "utf8");
const signup = readFileSync("app/api/signup/route.ts", "utf8");
const worker = readFileSync("scripts/qa/worker.ts", "utf8");
const metrics = readFileSync("lib/apiMetrics.ts", "utf8");

assert.doesNotMatch(qaRunner, /console\.(?:error|warn|log)\([^\n]*,\s*error\s*\)/,
  "QA runner must not log raw Error objects");
assert.doesNotMatch(qaRunner, /error\.message(?:\.slice\([^)]*\))?/,
  "QA runner must not persist raw exception messages in retained test history");
assert.doesNotMatch(qaRunner, /networkError:\s*(?:String\(error\)|error\.message)/,
  "QA runner must not persist raw network exception details");
assert.match(qaRunner, /networkErrorName/);
assert.match(qaRunner, /exceptionName/);
assert.match(signup, /Signup verification email failed\.[\s\S]*?errorName:/,
  "signup provider failure must log only its error class");
assert.doesNotMatch(signup, /console\.error\([^\n]*sendError/,
  "signup must not log raw email-provider exceptions");
assert.match(worker, /safeErrorName/);
assert.doesNotMatch(worker, /console\.(?:error|warn)\([^\n]*,\s*error\s*\)/,
  "worker must not log raw exception objects");
assert.match(metrics, /errorName: error instanceof Error \? error\.name : "UnknownError"/);

const opsDashboard = readFileSync("ops-dashboard/server.mjs", "utf8");
assert.ok(opsDashboard.includes('prisma.$on("error"'),
  "Ops dashboard database client errors must use a redacted event logger");
assert.ok(!opsDashboard.includes('console.error("Ops metrics query failed:",label,e?.message)'),
  "Ops metrics must not log raw database exception messages");
assert.ok(!opsDashboard.includes('console.error("Ops dashboard request failed:",e)'),
  "Ops request handler must not log raw exception objects");
assert.ok(!opsDashboard.includes('console.error("Ops dashboard browser error:",event.message)'),
  "Ops browser errors must not log raw browser messages");
assert.ok(!opsDashboard.includes('console.error("Ops dashboard unhandled promise:",event.reason)'),
  "Ops promise rejections must not log raw rejection values");
assert.ok(!opsDashboard.includes('error instanceof Error ? error.message : "unknown error"'),
  "Ops startup must not log database-driver exception messages");

console.log("QA runner and provider diagnostic redaction contract passed.");
