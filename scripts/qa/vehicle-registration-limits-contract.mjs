#!/usr/bin/env node
/**
 * Contract: POST /api/vehicles enforces field length limits and fleet count cap.
 *
 * Verifies source-level invariants so they cannot silently regress.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const route = readFileSync("app/api/vehicles/route.ts", "utf8");

// Field length limits must be checked after extraction
assert.match(route, /make\.length > 60/,
  "Vehicle make must be rejected when > 60 chars");
assert.match(route, /model\.length > 80/,
  "Vehicle model must be rejected when > 80 chars");
assert.match(route, /operatorLicenceNo\.length > 40/,
  "Operator licence number must be rejected when > 40 chars");

// Fleet count cap must be enforced inside the serialized transaction
assert.match(route, /fleetVehicleCount != null/,
  "Fleet cap check must be guarded by nullability (null = uncapped legacy accounts)");
assert.match(route, /tx\.vehicle\.count\(\s*\{[^}]*accountId: account\.id/,
  "Fleet count must be queried inside the transaction for serializability");
assert.match(route, /limitExceeded.*true/,
  "Transaction must signal cap exceeded via limitExceeded sentinel");
assert.match(route, /"limitExceeded" in vehicle/,
  "Response handler must check limitExceeded sentinel after the transaction");
assert.match(route, /status: 403/,
  "Fleet cap exceeded must return 403");

// Safety: null fleetVehicleCount must NOT be treated as zero
assert.doesNotMatch(route, /fleetVehicleCount === 0.*count/,
  "Null fleetVehicleCount must not trigger the cap check");

console.log("vehicle-registration-limits-contract passed.");
