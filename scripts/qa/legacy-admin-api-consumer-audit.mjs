#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { spawnSync } from "node:child_process";

const scan = (pattern, paths) => {
  const result = spawnSync("git", ["grep", "-n", "-I", "-E", pattern, "HEAD", "--", ...paths], { encoding: "utf8" });
  if (result.status === 0) return result.stdout.trim().split("\n");
  if (result.status === 1) return [];
  throw new Error("git grep failed: " + (result.stderr || result.error?.message || result.status));
};

const liveCallerMatches = scan("(/api/admin/performance|/admin/performance\\?days)", [
  "app", "components", "lib", "ops-dashboard",
]);
assert.deepEqual(liveCallerMatches, [],
  "Retired /api/admin/performance still has an application/runtime caller:\n" + liveCallerMatches.join("\n"));

const componentReferences = scan("PerformanceDashboard", ["app", "components", "lib"]);
assert.deepEqual(componentReferences, [],
  "The orphaned retired dashboard component still has a live reference:\n" + componentReferences.join("\n"));

const tombstone = readFileSync("app/api/admin/performance/route.ts", "utf8");
assert.match(tombstone, /status:\s*410/, "legacy endpoint must remain an explicit 410 tombstone");
assert.match(tombstone, /replacement:\s*"\/admin-access"/, "legacy endpoint must point to the replacement dashboard");
const page = readFileSync("app/admin/performance/page.tsx", "utf8");
assert.match(page, /redirect\("\/admin-access"\)/, "legacy page must redirect to the replacement dashboard");

console.log("PASS legacy admin API audit: no in-repository runtime caller; orphaned component removed; 410 tombstone and redirect preserved.");
console.log("LIMIT: this scan covers tracked app/runtime source, not external bookmarks, reverse proxies, monitoring, scheduled jobs, or third-party integrations.");
