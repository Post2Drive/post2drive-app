#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { MARKETS, isSupportedMarket, isWeeklyPricingMarket, sameMarket } from "../../lib/market.ts";
import {
  formatMarketCurrency,
  formatMarketDate,
  getJurisdictionOptions,
  getLocalisationProfile,
  getTimeZoneOptions,
} from "../../lib/localisation.ts";
import { VEHICLE_TYPES, vehicleTypeLabel } from "../../lib/vehicles.ts";
import {
  currencyMinorUnitScale,
  majorUnitsToMinorUnits,
  minorUnitsToMajorUnits,
} from "../../lib/currencyMinorUnits.ts";

let assertions = 0;
const check = (condition, message) => {
  assertions += 1;
  assert.ok(condition, message);
};
const source = (path) => readFileSync(path, "utf8").replace(/\r\n/g, "\n");
const contains = (path, fragment, message = fragment) =>
  check(source(path).includes(fragment), `${path}: ${message}`);

const markets = Object.values(MARKETS);
check(markets.length === 43, "Expected all 43 configured markets to be covered");
const weeklyMarkets = markets.filter((market) => market.country !== "IN");

for (const market of markets) {
  const identity = { country: market.country, currency: market.currency };
  const profile = getLocalisationProfile(identity);
  check(isSupportedMarket(identity), `${market.country}: canonical market identity rejected`);
  check(profile !== null, `${market.country}: localisation profile missing`);
  check(profile?.marketplaceLabel === market.label, `${market.country}: market label mismatch`);
  check(profile?.currency === market.currency, `${market.country}: currency mismatch`);
  check(profile?.locale === market.locale, `${market.country}: locale mismatch`);
  check(profile?.timeZone === market.timeZone, `${market.country}: time zone mismatch`);
  const jurisdictionRequired = ["IN", "US", "CA", "AU", "BE", "CH"].includes(market.country);
  check(profile?.jurisdictionSelectionRequired === jurisdictionRequired, `${market.country}: jurisdiction selection policy mismatch`);
  if (jurisdictionRequired) check(getJurisdictionOptions(market.country).length > 0, `${market.country}: jurisdiction options missing`);
  check(profile?.dialingCode === market.dialingCode, `${market.country}: dialing code mismatch`);
  check(isWeeklyPricingMarket(identity) === (market.country !== "IN"), `${market.country}: unexpected paid-access policy`);
  check(Boolean(formatMarketCurrency(1234.56, identity)), `${market.country}: currency formatting failed`);
  const expectedCurrencyText = new Intl.NumberFormat(market.locale, { style: "currency", currency: market.currency }).format(1234.56);
  check(formatMarketCurrency(1234.56, identity) === expectedCurrencyText, `${market.country}: market currency output must use standard currency precision`);
  check(Boolean(formatMarketDate("2026-10-18", identity)), `${market.country}: date formatting failed`);
  check(getTimeZoneOptions(market.country, market.timeZone).some((zone) => zone.value === market.timeZone), `${market.country}: default timezone is not selectable`);
  assert.doesNotThrow(() => new Intl.DateTimeFormat(market.locale, { timeZone: market.timeZone }), `${market.country}: invalid locale/time zone`);

  // Convert prices symmetrically according to the currency's actual minor-unit
  // precision. This covers ISK and any later zero-/three-decimal currencies.
  const scale = currencyMinorUnitScale(market.currency);
  check(Number.isInteger(scale) && scale >= 1 && scale <= 1000, `${market.country}: invalid minor-unit scale`);
  const minor = majorUnitsToMinorUnits(9.99, market.currency);
  const roundTrip = minorUnitsToMajorUnits(minor, market.currency);
  const expected = Math.round(9.99 * scale) / scale;
  check(Math.abs(roundTrip - expected) < 1e-9, `${market.country}: minor-unit conversion lost precision`);

  for (const type of VEHICLE_TYPES) {
    check(Boolean(vehicleTypeLabel(type, market.country)), `${market.country}: vehicle label missing for ${type}`);
  }
  if (market.country !== "GB") {
    check(!profile.registrationDocumentLabel.includes("V5C"), `${market.country}: UK V5C terminology leaked`);
    check(!profile.inspectionLabel.startsWith("MOT"), `${market.country}: UK MOT terminology leaked`);
    check(vehicleTypeLabel("Luton van", market.country) !== "Luton van", `${market.country}: UK-only vehicle label leaked`);
  }

  const other = markets.find((candidate) => candidate.country !== market.country);
  check(other !== undefined && !sameMarket(identity, { country: other.country, currency: other.currency }), `${market.country}: data-isolation boundary failed`);
}

// Feature/API parity: shared marketplace capabilities use canonical market
// validation, while only genuine commercial/legal differences remain market-gated.
contains("app/api/signup/route.ts", "marketForAccount({ country, currency })", "signup must accept canonical identities for every configured market");
contains("app/api/jobs/route.ts", "isSupportedMarket(account)", "job posting must validate the stored account market");
contains("app/api/jobs/route.ts", "validateJobInput(body, account)", "job posting must use market-aware validation");
contains("app/api/vehicles/route.ts", "getLocalisationProfile({ country: account.country, currency: account.currency })", "vehicle registration must use market-specific terminology/rules");
contains("app/api/jobs/[id]/bid/route.ts", "requireJobMarketAccess", "bidding must enforce same-market boundaries");
contains("app/api/jobs/[id]/accept/route.ts", "requireJobMarketAccess", "job acceptance must enforce same-market boundaries");
contains("app/api/subscription/create-payment/route.ts", "createPendingSubscriptionPayment", "all eligible markets need the shared subscription request path");
contains("lib/subscription.ts", "isWeeklyPricingEligible(account)", "paid access eligibility must use the shared market policy");
contains("app/api/promotion/status/route.ts", "paidPlan:\n      isWeeklyPricingEligible(account)", "paid plan details must not be hidden from eligible non-GB markets");
contains("app/api/promotion/status/route.ts", "active:\n        ukEligible &&\n        promotion.active", "the GB-only launch promotion must remain GB-only");
contains("app/api/account/access/route.ts", "minorUnitsToMajorUnits(priceMinorUnits, access.account.currency)", "access API must convert minor units using the account currency");
contains("lib/subscription.ts", "majorUnitsToMinorUnits(price, currency)", "subscription price must use currency-specific minor units");
contains("components/subscription-pricing.tsx", "checkout is not connected", "pricing must not imply that real checkout is live");
contains("components/subscription-status.tsx", "No payment provider is connected yet", "pending payment must not imply a real charge was taken");
contains("components/subscription-status.tsx", "const showPlanPrice = formattedPrice !== null", "expired paid markets must see their configured plan price");
contains("components/subscription-status.tsx", "{showPlanPrice && (", "pricing visibility must not be limited to the UK trial");

// User-facing job form must not offer an India workflow that server validation rejects.
contains("app/jobs/new/page.tsx", 'country !== "IN" && <option value="bid">', "India job creation must hide open bidding");
contains("app/jobs/new/page.tsx", 'country === "IN" && form.priceMode !== "fixed"', "India job creation must guard against bid mode");
contains("app/jobs/new/page.tsx", "currencyMinorUnitScale(currency)", "job price input must use the selected currency precision");
contains("app/jobs/page.tsx", 'accountCountry !== "IN" &&', "India marketplace must not expose bid actions");
contains("app/jobs/page.tsx", "currencyMinorUnitScale(job.currency)", "bid input must respect the job currency precision");
contains("app/dashboard/page.tsx", "This is a planning price only. Payment checkout is not connected yet", "dashboard must not imply an operational renewal checkout");

// These are explicit cross-market exceptions, not feature parity gaps: India
// pricing is separate, the UK trial is UK-only, and compliance can vary locally.
contains("lib/promotion.ts", "if (!isUkAccount(account))", "UK promotion rules must remain explicit");
contains("app/terms/page.tsx", "Draft for product testing", "terms must not be presented as launch-approved");
contains("app/privacy/page.tsx", "Draft for product testing", "privacy notice must not be presented as launch-approved");

console.log(JSON.stringify({
  status: "passed",
  supportedMarkets: markets.length,
  weeklyPaidMarkets: weeklyMarkets.length,
  indiaSeparatePricing: true,
  currencyPrecisionCases: markets.length,
  assertions,
  scope: "shared feature gates, localization, country/currency isolation, local formatting, vehicle terminology, subscription visibility and currency minor units",
  nonParityBlockers: [
    "A real payment provider / checkout is not connected; pending payment rows do not charge or activate access.",
    "Market-specific authenticated staging campaigns and independent local legal/compliance review remain launch gates."
  ]
}, null, 2));
