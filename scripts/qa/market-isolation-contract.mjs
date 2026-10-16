#!/usr/bin/env node
import assert from "node:assert/strict";
import { getMarket, isSupportedMarket, isWeeklyPricingMarket, sameMarket } from "../../lib/market.ts";

assert.equal(getMarket("GB")?.currency, "GBP");
assert.equal(getMarket("GB")?.timeZone, "Europe/London");
assert.equal(getMarket("IN")?.currency, "INR");
assert.equal(getMarket("IN")?.timeZone, "Asia/Kolkata");
const euroMarkets = ["AT", "BE", "BG", "HR", "CY", "EE", "FI", "FR", "DE", "GR", "IE", "IT", "LV", "LT", "LU", "MT", "NL", "PT", "SK", "SI", "ES", "AD", "MC", "SM", "VA", "XK", "ME"];
for (const country of euroMarkets) {
  assert.equal(getMarket(country)?.currency, "EUR", `${country} must use EUR`);
  assert.equal(isSupportedMarket({ country, currency: "EUR" }), true, `${country} + EUR must be supported`);
}
assert.equal(euroMarkets.length, 27, "all EU euro-area countries and other euro-using European states are included");
assert.equal(getMarket("US"), null, "unsupported countries must not be selectable");
assert.equal(getMarket("CZ"), null, "EU members that do not use the euro remain unsupported");
assert.equal(isSupportedMarket({ country: "GB", currency: "GBP" }), true);
assert.equal(isSupportedMarket({ country: "IN", currency: "INR" }), true);
assert.equal(isSupportedMarket({ country: "GB", currency: "INR" }), false, "currency must match country");
assert.equal(isSupportedMarket({ country: "IN", currency: "GBP" }), false, "currency must match country");
assert.equal(sameMarket({ country: "GB", currency: "GBP" }, { country: "GB", currency: "GBP" }), true);
assert.equal(sameMarket({ country: "GB", currency: "GBP" }, { country: "IN", currency: "INR" }), false);
assert.equal(sameMarket({ country: "FR", currency: "EUR" }, { country: "DE", currency: "EUR" }), false, "euro countries remain isolated from each other");
assert.equal(isWeeklyPricingMarket({ country: "GB", currency: "GBP" }), true);
assert.equal(isWeeklyPricingMarket({ country: "IE", currency: "EUR" }), true);
assert.equal(isWeeklyPricingMarket({ country: "IN", currency: "INR" }), false);
assert.equal(isWeeklyPricingMarket({ country: "FR", currency: "GBP" }), false, "country and currency must match for paid access");
assert.equal(sameMarket({ country: "GB", currency: "INR" }, { country: "GB", currency: "INR" }), false, "invalid market identities must never compare equal");
console.log("Market isolation contract checks passed: GB, IN and 27 euro-using European markets; currencies and cross-market separation.");
