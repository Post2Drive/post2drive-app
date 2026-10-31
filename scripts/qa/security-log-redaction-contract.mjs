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
assert.match(opsDashboard, /prisma\\.\\$on\\("error"/);
assert.doesNotMatch(opsDashboard, /console\\.error\\("Ops metrics query failed:",label,e\\?\\.message\\)/);
assert.doesNotMatch(opsDashboard, /console\\.error\\("Ops dashboard request failed:",e\\)/);
assert.doesNotMatch(opsDashboard, /console\\.error\\("Ops dashboard browser error:",event\\.message\\)/);
assert.doesNotMatch(opsDashboard, /console\\.error\\("Ops dashboard unhandled promise:",event\\.reason\\)/);
assert.doesNotMatch(opsDashboard, /error instanceof Error \\? error\\.message : "unknown error"/);

console.log("QA runner and provider diagnostic redaction contract passed.");
