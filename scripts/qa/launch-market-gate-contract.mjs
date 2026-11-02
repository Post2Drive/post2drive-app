#!/usr/bin/env node
/**
 * launch-market-gate-contract.mjs
 *
 * Asserts that:
 *  1. The LAUNCH_COUNTRIES set is a strict subset of MARKETS.
 *  2. GB and IN are always included (they are the two active markets).
 *  3. isLaunchMarket() returns correct values for all known countries.
 *  4. lib/currency.ts filters COUNTRIES by LAUNCH_COUNTRIES (source-level check).
 *  5. Default launch set is exactly {GB, IN} when no env override is set.
 *
 * Run with LAUNCH_COUNTRIES unset (production default) or explicitly set.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { MARKETS, LAUNCH_COUNTRIES, isLaunchMarket } from "../../lib/market.ts";

// 1. Every launch country must be a recognised MARKETS key.
for (const code of LAUNCH_COUNTRIES) {
  assert.ok(Object.prototype.hasOwnProperty.call(MARKETS, code),
    `LAUNCH_COUNTRIES contains "${code}" which is not a recognised market`);
}

// 2. GB and IN must always be in the launch set.
assert.ok(LAUNCH_COUNTRIES.has("GB"), "GB must always be a launch market");
assert.ok(LAUNCH_COUNTRIES.has("IN"), "IN must always be a launch market");

// 3. isLaunchMarket helper must agree with the set.
for (const code of Object.keys(MARKETS)) {
  const expected = LAUNCH_COUNTRIES.has(code);
  assert.equal(isLaunchMarket(code), expected,
    `isLaunchMarket("${code}") should be ${expected}`);
}
assert.equal(isLaunchMarket(null), false, "isLaunchMarket(null) must be false");
assert.equal(isLaunchMarket(undefined), false, "isLaunchMarket(undefined) must be false");
assert.equal(isLaunchMarket(""), false, "isLaunchMarket('') must be false");
assert.equal(isLaunchMarket("ZZ"), false, "isLaunchMarket unknown code must be false");

// 4. Source-level check: lib/currency.ts must filter by LAUNCH_COUNTRIES.
const currencySource = readFileSync("lib/currency.ts", "utf8");
assert.match(currencySource, /LAUNCH_COUNTRIES/,
  "lib/currency.ts must import and use LAUNCH_COUNTRIES to filter the selectable market list");
assert.match(currencySource, /\.filter\(/,
  "lib/currency.ts must filter markets before exposing them in COUNTRIES");

// 5. Default (production) set is exactly GB and IN.
if (!process.env.LAUNCH_COUNTRIES && !process.env.NEXT_PUBLIC_LAUNCH_COUNTRIES) {
  assert.equal(LAUNCH_COUNTRIES.size, 2,
    "Default launch set must contain exactly 2 countries (GB, IN)");
  assert.ok(LAUNCH_COUNTRIES.has("GB"), "Default launch set must include GB");
  assert.ok(LAUNCH_COUNTRIES.has("IN"), "Default launch set must include IN");
  // Verify non-launch markets are not in the set.
  for (const code of ["US", "DE", "FR", "AU", "AT"]) {
    assert.ok(!LAUNCH_COUNTRIES.has(code),
      `${code} must not be in the default launch set`);
  }
}

console.log(
  `launch-market-gate contract passed — ${LAUNCH_COUNTRIES.size} launch market(s): ${[...LAUNCH_COUNTRIES].join(", ")}`
);
