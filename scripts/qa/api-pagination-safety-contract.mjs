/**
 * Contract: every list API that returns records to the client must have a
 * hard server-side `take` cap so that an account with a large number of rows
 * can never produce an unbounded DB result set or an OOM payload.
 *
 * This is a source-level check — it verifies the cap is present in the code.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) =>
  readFileSync(new URL("../../" + path, import.meta.url), "utf8");

// ── jobs GET ────────────────────────────────────────────────────────────────
const jobsRoute = read("app/api/jobs/route.ts");

// The main findMany that returns the jobs list to the client must have a take.
assert.match(
  jobsRoute,
  /prisma\.job\.findMany\([\s\S]*?take:\s*\d+[\s\S]*?orderBy:/,
  "app/api/jobs GET: findMany must include a hard take: cap before orderBy"
);

// ── payments GET ─────────────────────────────────────────────────────────────
const paymentsRoute = read("app/api/payments/route.ts");

// Both asPoster and asDriver queries must be capped.
const paymentsTakeMatches = [
  ...paymentsRoute.matchAll(/prisma\.job\.findMany\([\s\S]*?take:\s*(\d+)/g),
];
assert.ok(
  paymentsTakeMatches.length >= 2,
  `app/api/payments GET: both findMany calls (asPoster and asDriver) must have a take: cap; found ${paymentsTakeMatches.length}`
);

console.log(
  "API pagination safety contract passed — all list endpoints have hard take: caps."
);
