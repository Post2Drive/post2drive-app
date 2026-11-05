#!/usr/bin/env node
/**
 * Guard the marketplace job listing's open-status filter and supporting
 * currency/status compound index. This is a source contract; database
 * migrations are validated separately by the CI workflow.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const route = readFileSync("app/api/jobs/route.ts", "utf8");
const schema = readFileSync("prisma/schema.prisma", "utf8");

assert.match(
  route,
  /const localOpenWhere\s*:\s*any\s*=\s*\{[^}]*status:\s*"open"/s,
  "the marketplace listing must filter open jobs by status",
);
assert.match(
  route,
  /const localOpenWhere\s*:\s*any\s*=\s*\{[^}]*status:\s*"open"[^}]*currency/s,
  "the open-job listing filter must include the requester's currency",
);
assert.match(
  route,
  /localOpenWhere/,
  "the open-job filter must be used by the listing query",
);
assert.match(
  schema,
  /@@index\(\[currency,\s*status\]\)/,
  "the Job model must have a compound currency/status index",
);

console.log("PASS job listing filters by open status and has the currency/status index");
