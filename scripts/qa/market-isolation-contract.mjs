#!/usr/bin/env node
import assert from "node:assert/strict";
import { getMarket, isSupportedMarket, sameMarket } from "../../lib/market.ts";

assert.equal(getMarket("GB")?.currency, "GBP");
assert.equal(getMarket("GB")?.timeZone, "Europe/London");
assert.equal(getMarket("IN")?.currency, "INR");
assert.equal(getMarket("IN")?.timeZone, "Asia/Kolkata");
assert.equal(getMarket("US"), null, "unsupported countries must not be selectable");
assert.equal(isSupportedMarket({ country: "GB", currency: "GBP" }), true);
assert.equal(isSupportedMarket({ country: "IN", currency: "INR" }), true);
assert.equal(isSupportedMarket({ country: "GB", currency: "INR" }), false, "currency must match country");
assert.equal(isSupportedMarket({ country: "IN", currency: "GBP" }), false, "currency must match country");
assert.equal(sameMarket({ country: "GB", currency: "GBP" }, { country: "GB", currency: "GBP" }), true);
assert.equal(sameMarket({ country: "GB", currency: "GBP" }, { country: "IN", currency: "INR" }), false);
assert.equal(sameMarket({ country: "GB", currency: "INR" }, { country: "GB", currency: "INR" }), false, "invalid market identities must never compare equal");
console.log("Market isolation contract checks passed: supported markets, currencies and cross-market separation.");
