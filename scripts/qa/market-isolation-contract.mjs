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
const additionalMarkets = {
  CZ: "CZK", DK: "DKK", HU: "HUF", IS: "ISK", NO: "NOK", PL: "PLN",
  RO: "RON", SE: "SEK", CH: "CHF", TR: "TRY", US: "USD", CA: "CAD",
  AU: "AUD", NZ: "NZD",
};
for (const [country, currency] of Object.entries(additionalMarkets)) {
  assert.equal(getMarket(country)?.currency, currency, `${country} must use ${currency}`);
  assert.equal(isSupportedMarket({ country, currency }), true, `${country} + ${currency} must be supported`);
  assert.equal(isSupportedMarket({ country, currency: "EUR" }), false, `${country} must reject mismatched currency`);
  assert.equal(isWeeklyPricingMarket({ country, currency }), true, `${country} must use the UK weekly pricing model`);
}
assert.equal(Object.keys(additionalMarkets).length, 14, "all requested additional markets are included");
assert.equal(isSupportedMarket({ country: "GB", currency: "GBP" }), true);
assert.equal(isSupportedMarket({ country: "IN", currency: "INR" }), true);
assert.equal(isSupportedMarket({ country: "GB", currency: "INR" }), false, "currency must match country");
assert.equal(isSupportedMarket({ country: "IN", currency: "GBP" }), false, "currency must match country");
assert.equal(sameMarket({ country: "GB", currency: "GBP" }, { country: "GB", currency: "GBP" }), true);
assert.equal(sameMarket({ country: "GB", currency: "GBP" }, { country: "IN", currency: "INR" }), false);
assert.equal(sameMarket({ country: "FR", currency: "EUR" }, { country: "DE", currency: "EUR" }), false, "euro countries remain isolated from each other");
assert.equal(isWeeklyPricingMarket({ country: "GB", currency: "GBP" }), true);
assert.equal(isWeeklyPricingMarket({ country: "IE", currency: "EUR" }), true);
for (const [country, currency] of Object.entries(additionalMarkets)) {
  assert.equal(isWeeklyPricingMarket({ country, currency }), true, `${country} must use the UK weekly pricing model`);
}
assert.equal(isWeeklyPricingMarket({ country: "IN", currency: "INR" }), false);
assert.equal(isWeeklyPricingMarket({ country: "FR", currency: "GBP" }), false, "country and currency must match for paid access");
assert.equal(sameMarket({ country: "GB", currency: "INR" }, { country: "GB", currency: "INR" }), false, "invalid market identities must never compare equal");
console.log("Market isolation contract checks passed: UK pricing model for all supported non-India markets, India remains separate, currencies and cross-market separation.");
