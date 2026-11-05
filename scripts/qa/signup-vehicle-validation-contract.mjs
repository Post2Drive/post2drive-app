#!/usr/bin/env node
/**
 * Contract: signup API derives planType server-side from vehicleCount.
 * Verifies that client-supplied planType is ignored and that vehicle count
 * bounds (1–55) are enforced regardless of what planType the client sends.
 *
 * Static source inspection — no network calls required.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const src = readFileSync("app/api/signup/route.ts", "utf8");

// Plan must be derived from parsed vehicle count, not from client planType.
assert.match(
  src,
  /const selectedPlan = parsedFleetVehicleCount === 1 \? "individual" : "fleet"/,
  "planType must be derived server-side from vehicleCount, not accepted from client input"
);

// Vehicle count lower bound enforced before plan derivation.
assert.match(
  src,
  /parsedFleetVehicleCount < 1/,
  "Vehicle count must reject values below 1"
);

// Vehicle count upper bound enforced.
assert.match(
  src,
  /parsedFleetVehicleCount > 55/,
  "Vehicle count must reject values above 55"
);

// The old trust-client pattern must be gone.
assert.doesNotMatch(
  src,
  /const selectedPlan = planType/,
  "planType from client must not be used directly to set selectedPlan"
);

console.log("signup-vehicle-validation-contract passed.");
