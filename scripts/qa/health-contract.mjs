#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";

const routePath = "app/api/health/route.ts";
assert.ok(existsSync(routePath), `Missing Railway health endpoint: ${routePath}`);
const route = readFileSync(routePath, "utf8");
for (const required of [
  'export async function GET()',
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
