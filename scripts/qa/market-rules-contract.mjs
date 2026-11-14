// Market rules must give the same answers the old country checks gave, and
// the batch-moved feature files must no longer carry those checks.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { rulesForAccount, rulesForCountry } from "../../lib/marketRules.ts";

let checks = 0;
const eq = (a, e, m) => { assert.deepEqual(a, e, m); checks++; };

const IN = { country: "IN", currency: "INR" };
const GB = { country: "GB", currency: "GBP" };
const US = { country: "US", currency: "USD" };

eq(rulesForAccount(IN).phoneFirst, true, "India signs in by phone");
eq(rulesForAccount(GB).phoneFirst, false, "UK signs in by email");
eq(rulesForAccount({ country: "IN", currency: "GBP" }).phoneFirst, false, "a country and currency mismatch gets default rules");
eq(rulesForAccount(US).regionFormat, "short-code", "other markets use short region codes");
eq(rulesForCountry("IN").regionFormat, "none", "India does not use regions");
eq(rulesForCountry("GB").regionFormat, "uk-postcode-area", "UK regions are postcode areas");

// Feature files resolve "@/" imports, which plain Node cannot load here, so their
// behaviour is covered by the market-isolation and country-matrix suites. This
// contract checks they now read the shared rules.
eq(rulesForAccount(IN).feeFree, true, "India is fee-free");
eq(rulesForAccount(GB).feeFree, false, "UK charges verification fees");
eq(rulesForAccount(IN).subscriptionPricing, false, "India has no paid plans");
eq(rulesForAccount({ country: "IN", currency: "GBP" }).feeFree, false, "fee-free needs the matching currency");

for (const [file, pattern] of [
  ["lib/eligibility.ts", /country === "IN"/],
  ["lib/verificationFees.ts", /country === "IN"/],
  ["lib/vehicleApproval.ts", /country === "IN"/],
  ["lib/pricing.ts", /country === "IN"/],
  ["lib/launchWindows.ts", /country === "(IN|GB)"/],
]) {
  eq(pattern.test(readFileSync(file, "utf8")), false, `${file} no longer hard-codes a market`);
}

console.log(`market rules contract passed (${checks} checks)`);
