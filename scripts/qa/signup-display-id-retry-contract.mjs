#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");
const signup = read("app/api/signup/route.ts");
const displayId = read("lib/displayId.ts");

// Ten thousand accounts can share the same four-letter company prefix.
// Expand the random namespace so collisions are uncommon before retries.
assert.ok(displayId.includes('import { randomInt } from "node:crypto";'));
assert.ok(displayId.includes("randomInt(10_000_000, 100_000_000)"), "new display IDs should use an eight-digit cryptographically random suffix");

// A preflight read is not a reservation. The unique database constraint must
// arbitrate concurrent creates, and only displayId collisions should be retried.
assert.ok(signup.includes("const maxDisplayIdAttempts = 5;"));
assert.ok(signup.includes("await prisma.$transaction("));
assert.ok(signup.includes("const isDisplayIdCollision ="));
assert.ok(signup.includes('databaseError.code === "P2002"'));
assert.ok(signup.includes('target.includes("displayid") || target.includes("display_id")'));
assert.ok(signup.includes("if (!isDisplayIdCollision) throw error;"));
assert.ok(signup.includes('console.warn("Signup displayId collision"'));
assert.ok(signup.includes('console.info("Signup displayId reservation outcome"'));
assert.ok(signup.includes('console.warn("Signup displayId reservation exhausted"'));
assert.ok(!signup.includes("finalDisplayIdClash"), "remove the racy final preflight lookup");
assert.ok(!/prisma\.account\.findUnique\(\{\s*where:\s*\{\s*displayId,/.test(signup), "do not rely on preflight lookup to reserve IDs");
assert.ok(!signup.includes('console.error("Signup error:", error)'), "do not log raw signup errors that may contain account data");

console.log("PASS signup displayId retry contract: high-entropy IDs, database-authoritative atomic reservation, bounded collision-only retries, and privacy-safe diagnostics.");
