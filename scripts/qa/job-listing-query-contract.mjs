/**
 * Asserts that:
 * 1. The job listing query (localOpenWhere) includes status: "open" so the DB
 *    does not fetch completed/cancelled/in-transit jobs for the marketplace.
 * 2. The Job model schema includes a compound @@index([currency, status]) to
 *    support the market-filtered listing query efficiently.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL("../../" + path, import.meta.url), "utf8");

const jobsRoute = read("app/api/jobs/route.ts");
const schema = read("prisma/schema.prisma");

// 1. localOpenWhere must contain status: "open" so the DB filters it
assert.match(
  jobsRoute,
  /const localOpenWhere[\s\S]*?status:\s*["']open["']/,
  "localOpenWhere must include status: 'open' to prevent fetching non-open jobs from the database"
);

// 2. Schema must have the compound index
assert.match(
  schema,
  /@@index\(\[currency,\s*status\]\)/,
  "Job model must have @@index([currency, status]) compound index for market-filtered listing"
);

console.log("job-listing-query-contract passed.");
