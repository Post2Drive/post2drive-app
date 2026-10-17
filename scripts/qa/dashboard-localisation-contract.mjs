#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const dashboard = readFileSync("app/dashboard/page.tsx", "utf8");

assert.match(dashboard, /getLocalisationProfile\(\{ country: account\.country, currency: account\.currency \}\)/,
  "dashboard must resolve the signed-in account's validated market profile");
assert.match(dashboard, /marketProfile\?\.marketplaceLabel \?\? account\.country/,
  "dashboard must show a market label rather than exposing country codes as the primary label");
assert.match(dashboard, /formatMarketCurrency\(plan\.price, \{ country: account\.country, currency: account\.currency \}\)/,
  "dashboard subscription prices must use the account's market locale and currency");
assert.match(dashboard, /\{ukEligible && \(/,
  "UK-only promotional programme must remain explicitly gated to eligible UK accounts");
assert.doesNotMatch(dashboard, /symbolFor\(plan\.currency|plan\.price\.toFixed\(2\)/,
  "dashboard must not render subscription prices with a generic currency symbol and decimal format");

console.log("Dashboard localisation contract passed: market label, locale-aware currency, and UK-only promotion gating.");
