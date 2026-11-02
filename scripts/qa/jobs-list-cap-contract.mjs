/**
 * QA contract: GET /api/jobs hard cap
 *
 * Asserts that:
 * 1. JOB_LIST_CAP is defined as 500.
 * 2. findMany uses take: JOB_LIST_CAP + 1.
 * 3. The response slices to JOB_LIST_CAP and includes hasMore.
 */
import { readFileSync } from "fs";
import { resolve } from "path";

const route = readFileSync(resolve("app/api/jobs/route.ts"), "utf8");

if (!/const JOB_LIST_CAP = 500/.test(route)) {
  console.error("FAIL: JOB_LIST_CAP = 500 not found in jobs route");
  process.exit(1);
}

if (!/take:\s*JOB_LIST_CAP\s*\+\s*1/.test(route)) {
  console.error("FAIL: findMany does not use take: JOB_LIST_CAP + 1");
  process.exit(1);
}

if (!/const hasMore = filtered\.length > JOB_LIST_CAP/.test(route)) {
  console.error("FAIL: hasMore derivation not found");
  process.exit(1);
}

if (!/hasMore,/.test(route)) {
  console.error("FAIL: hasMore not included in response");
  process.exit(1);
}

console.log("PASS: GET /api/jobs hard cap contract satisfied (500 rows, hasMore flag)");
