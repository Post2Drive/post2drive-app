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

const allPathMatches = scan("(/api/admin/performance|/admin/performance\\?days)", [
  "app", "components", "lib", "ops-dashboard",
]);
// The only remaining path strings are intentional QA route-matrix probes. They
// assert HTTP 410 for both anonymous and authenticated requests. No live UI,
// library, or dashboard server may call the retired endpoint.
const qaProbes = allPathMatches.filter((line) => line.includes(":lib/qaRunner.ts:"));
const runtimeMatches = allPathMatches.filter((line) => !line.includes(":lib/qaRunner.ts:"));
assert.deepEqual(runtimeMatches, [],
  "Retired /api/admin/performance still has an application/runtime caller:\n" + runtimeMatches.join("\n"));
assert.equal(qaProbes.length, 2, "expected exactly two QA probes for the retired tombstone");
assert.ok(qaProbes.every((line) => line.includes("retired-admin-performance") && line.includes("expected: [410]")),
  "QA probes must document the tombstone's 410 behavior:\n" + qaProbes.join("\n"));

const componentReferences = scan("PerformanceDashboard", ["app", "components", "lib"]);
assert.deepEqual(componentReferences, [],
  "The orphaned retired dashboard component still has a live reference:\n" + componentReferences.join("\n"));

const tombstone = readFileSync("app/api/admin/performance/route.ts", "utf8");
assert.match(tombstone, /status:\s*410/, "legacy endpoint must remain an explicit 410 tombstone");
assert.match(tombstone, /replacement:\s*"\/admin-access"/, "legacy endpoint must point to the replacement dashboard");
const page = readFileSync("app/admin/performance/page.tsx", "utf8");
assert.match(page, /redirect\("\/admin-access"\)/, "legacy page must redirect to the replacement dashboard");

console.log("PASS legacy admin API audit: no live runtime caller; exactly two QA probes expect 410; orphaned component removed; tombstone and redirect preserved.");
console.log("LIMIT: this scan covers tracked app/runtime source, not external bookmarks, reverse proxies, monitoring, scheduled jobs, or third-party integrations.");
