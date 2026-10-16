#!/usr/bin/env node
import assert from "node:assert/strict";
import { MARKETS, isSupportedMarket, sameMarket, marketForAccount, isWeeklyPricingMarket } from "../../lib/market.ts";

const markets = Object.values(MARKETS);
const currencies = [...new Set(markets.map((market) => market.currency))];
const iterationsPerCountry = Number(process.env.COUNTRY_SCENARIOS_PER_MARKET || 10_000);
assert.ok(Number.isInteger(iterationsPerCountry) && iterationsPerCountry > 0, "COUNTRY_SCENARIOS_PER_MARKET must be a positive integer");

let scenarios = 0;
let assertions = 0;
const check = (condition, message) => {
  assertions += 1;
  assert.ok(condition, message);
};

for (const market of markets) {
  // Check the canonical identity and timezone once before generating scenarios.
  check(isSupportedMarket(market), `${market.country}: canonical country/currency must be supported`);
  check(marketForAccount(market)?.timeZone === market.timeZone, `${market.country}: account timezone must match the market registry`);
  check(isWeeklyPricingMarket(market) === (market.country !== "IN"), `${market.country}: pricing model must match market policy`);
  assert.doesNotThrow(() => new Intl.DateTimeFormat(market.locale, { timeZone: market.timeZone }), `${market.country}: locale/timezone must be valid`);

  for (let i = 0; i < iterationsPerCountry; i += 1) {
    const other = markets[(markets.indexOf(market) + 1 + (i % (markets.length - 1))) % markets.length];
    const wrongCurrency = currencies[(currencies.indexOf(market.currency) + 1 + (i % (currencies.length - 1))) % currencies.length];
    const scenario = i % 6;

    // Valid identity, wrong currency, malformed country casing, unknown country,
    // absent currency, and cross-market isolation are all exercised repeatedly.
    if (scenario === 0) {
      check(isSupportedMarket({ country: market.country, currency: market.currency }), `${market.country} #${i}: valid identity rejected`);
      check(sameMarket(market, { country: market.country, currency: market.currency }), `${market.country} #${i}: same market should match itself`);
    } else if (scenario === 1) {
      check(!isSupportedMarket({ country: market.country, currency: wrongCurrency }), `${market.country} #${i}: mismatched currency accepted`);
      check(marketForAccount({ country: market.country, currency: wrongCurrency }) === null, `${market.country} #${i}: mismatched identity resolved`);
    } else if (scenario === 2) {
      check(!isSupportedMarket({ country: market.country.toLowerCase(), currency: market.currency }), `${market.country} #${i}: non-canonical country casing accepted`);
    } else if (scenario === 3) {
      check(!isSupportedMarket({ country: `ZZ${i}`, currency: market.currency }), `${market.country} #${i}: unknown country accepted`);
    } else if (scenario === 4) {
      check(!isSupportedMarket({ country: market.country, currency: null }), `${market.country} #${i}: missing currency accepted`);
    } else {
      check(!sameMarket(market, other), `${market.country} #${i}: cross-country isolation failed against ${other.country}`);
    }
    scenarios += 1;
  }
}

console.log(JSON.stringify({
  status: "passed",
  supportedMarkets: markets.length,
  scenariosPerCountry: iterationsPerCountry,
  totalGeneratedScenarios: scenarios,
  assertions,
  scope: "market identity, currency mismatch rejection, malformed/unknown country rejection, pricing policy, timezone registry and cross-market isolation",
  limitation: "This is a deterministic contract test, not a substitute for authenticated end-to-end route tests or a penetration test."
}, null, 2));
