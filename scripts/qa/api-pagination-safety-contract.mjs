/**
 * Contract: GET /api/payments caps the poster/driver job lists, but the
 * dashboard totals must come from database aggregates over the same uncapped
 * where-clause, never from the capped arrays. Otherwise an account with more
 * completed jobs than the cap silently sees wrong totals.
 *
 * Jobs-list capping is covered by qa:job-listing-query, so it is not checked here.
 *
 * This is a source-level check; it verifies the shape of the code.
 */

import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) =>
  readFileSync(new URL("../../" + path, import.meta.url), "utf8");

const route = read("app/api/payments/route.ts");

// ── Lists stay capped, fetching cap + 1 to detect truncation ────────────────
assert.match(route, /const PAYMENT_LIST_CAP = \d+;/, "payments: PAYMENT_LIST_CAP constant must exist");
const capTakes = [...route.matchAll(/take:\s*PAYMENT_LIST_CAP \+ 1/g)];
assert.equal(capTakes.length, 2, "payments: both list findMany calls must use take: PAYMENT_LIST_CAP + 1");
assert.doesNotMatch(route, /take:\s*\d+/, "payments: no hard-coded numeric take; use PAYMENT_LIST_CAP");

// ── Deterministic ordering with id tiebreaker ───────────────────────────────
assert.match(
  route,
  /\[\s*\{\s*createdAt:\s*"desc"[^}]*\}\s*,\s*\{\s*id:\s*"desc"[^}]*\}\s*\]/,
  "payments: list order must be [{ createdAt: 'desc' }, { id: 'desc' }]",
);
assert.equal([...route.matchAll(/orderBy:\s*listOrder/g)].length, 2, "payments: both lists must use the tiebreaker order");

// ── Truncation flags returned to the client ─────────────────────────────────
for (const field of ["asPosterHasMore", "asDriverHasMore"]) {
  assert.match(route, new RegExp(`${field}:`), `payments: response must include ${field}`);
}

// ── Totals come from aggregates, not from the capped arrays ─────────────────
assert.ok(
  [...route.matchAll(/prisma\.job\.aggregate\(/g)].length >= 2,
  "payments: totals must be computed with prisma.job.aggregate",
);
assert.match(route, /_sum:\s*\{\s*price:\s*true\s*\}/, "payments: aggregates must sum price");
assert.match(route, /_count:\s*\{\s*_all:\s*true\s*\}/, "payments: aggregates must count rows");
assert.doesNotMatch(
  route,
  /\b(asPoster|asDriver|posterRows|driverRows)\s*\.\s*(reduce|filter)\s*\(/,
  "payments: summary totals must not be derived from the capped list arrays",
);
assert.doesNotMatch(
  route,
  /jobsDone:\s*(asPoster|asDriver|posterRows|driverRows)\.length/,
  "payments: jobsDone must be a full count, not the capped list length",
);

// ── UI explains truncation ──────────────────────────────────────────────────
const page = read("app/payments/page.tsx");
assert.match(page, /asPosterHasMore/, "payments page: must show a note when the poster list is truncated");
assert.match(page, /asDriverHasMore/, "payments page: must show a note when the driver list is truncated");

console.log("API pagination safety contract passed — payments lists capped, totals from full-data aggregates.");
