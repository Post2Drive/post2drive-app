#!/usr/bin/env node
import assert from "node:assert/strict";
import { MARKETS } from "../../lib/market.ts";
import { getLocalisationProfile, formatMarketDate, getJurisdictionOptions } from "../../lib/localisation.ts";
import { VEHICLE_TYPES, vehicleTypeLabel } from "../../lib/vehicles.ts";

let assertions = 0;
const check = (condition, message) => {
  assertions += 1;
  assert.ok(condition, message);
};

for (const market of Object.values(MARKETS)) {
  const profile = getLocalisationProfile({ country: market.country, currency: market.currency });
  check(profile !== null, `${market.country}: localisation profile missing`);
  check(profile?.marketplaceLabel === market.label, `${market.country}: market label mismatch`);
  check(profile?.currency === market.currency, `${market.country}: currency mismatch`);
  check(profile?.locale === market.locale, `${market.country}: locale mismatch`);
  check(profile?.timeZone === market.timeZone, `${market.country}: timezone mismatch`);
  check(profile?.dialingCode === market.dialingCode, `${market.country}: dialing code mismatch`);
  check(profile?.authorityLabel !== "Local vehicle registration / transport authority", `${market.country}: market-specific authority terminology missing`);
  check(profile?.distanceUnit === (market.country === "GB" || market.country === "US" ? "mile" : "km"), `${market.country}: distance unit mismatch`);
  check(profile?.inspectionRequiredAtCountryLevel === false, `${market.country}: blanket inspection rule is unsafe without vehicle class/jurisdiction`);
  check(Boolean(formatMarketDate("2026-10-17", { country: market.country, currency: market.currency })), `${market.country}: calendar date formatting failed`);

  for (const type of VEHICLE_TYPES) {
    check(Boolean(vehicleTypeLabel(type, market.country)), `${market.country}: empty vehicle label for ${type}`);
  }

  if (market.country !== "GB") {
    check(vehicleTypeLabel("Luton van", market.country) !== "Luton van", `${market.country}: UK-specific Luton van label leaked`);
    check(vehicleTypeLabel("32t HGV artic", market.country) !== "32t HGV artic", `${market.country}: UK-specific HGV label leaked`);
    check(!profile?.registrationDocumentLabel.includes("V5C"), `${market.country}: UK V5C label leaked`);
    check(!profile?.inspectionLabel.startsWith("MOT"), `${market.country}: UK MOT label leaked`);
  }
}

for (const identity of [
  { country: "US", currency: "USD" },
  { country: "CA", currency: "CAD" },
  { country: "AU", currency: "AUD" },
]) {
  check(getLocalisationProfile(identity)?.jurisdictionSelectionRequired === true, `${identity.country}: region-level jurisdiction requirement missing`);
}
for (const country of ["IN", "US", "CA", "AU", "BE", "CH"]) {
  check(getJurisdictionOptions(country).length > 0, `${country}: jurisdiction options missing`);
  const market = Object.values(MARKETS).find((item) => item.country === country);
  check(getLocalisationProfile({ country, currency: market?.currency })?.jurisdictionSelectionRequired === true, `${country}: jurisdiction should be required`);
}
check(getLocalisationProfile({ country: "US", currency: "GBP" }) === null, "mismatched country/currency should not resolve a localisation profile");

console.log(JSON.stringify({
  status: "passed",
  supportedMarkets: Object.keys(MARKETS).length,
  assertions,
  scope: "market metadata, locale dates, country-specific vehicle authority terms, distance units, inspection-rule safety and vehicle labels across every supported market",
  limitation: "This contract test does not replace legal verification of each country's laws or state/province/territory-specific requirements."
}, null, 2));
