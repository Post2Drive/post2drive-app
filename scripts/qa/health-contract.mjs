#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";

const routePath = "app/api/health/route.ts";
assert.ok(existsSync(routePath), `Missing Railway health endpoint: ${routePath}`);
const route = readFileSync(routePath, "utf8");
// Accept either bare export or withApiMetrics-wrapped export
assert.ok(
  route.includes('export async function GET()') || route.includes('export const GET'),
  `${routePath} is missing health contract: export async function GET() or export const GET`
);
for (const required of [
  'await prisma.$queryRaw`SELECT 1`',
  'status: "ok"',
  'database: "ok"',
  'status: "unavailable"',
  'database: "failed"',
  'Cache-Control": "no-store"',
]) {
  assert.ok(route.includes(required), `${routePath} is missing health contract: ${required}`);
}
assert.ok(!route.includes('error.message'), "Health endpoint must not return raw database errors");
console.log("Health endpoint contract checks passed.");
