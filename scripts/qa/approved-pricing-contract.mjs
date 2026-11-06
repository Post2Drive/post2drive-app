// Approved pricing contract (owner decision 2026-11-06).
// Keeps lib/pricing.ts, the public pricing page, signup and the policy docs in agreement,
// and stops anyone re-introducing hard-coded or superseded prices.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

import { register } from "node:module";

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
// Resolve the app's "@/x" path alias to "<repo>/x.ts" so lib/pricing.ts loads unmodified.
const root = new URL("../../", import.meta.url).href;
register(`data:text/javascript,${encodeURIComponent(`
  export async function resolve(specifier, context, next) {
    if (specifier.startsWith("@/")) return next(${JSON.stringify(root)} + specifier.slice(2) + ".ts", context);
    return next(specifier, context);
  }`)}`);
const pricing = await import(new URL("../../lib/pricing.ts", import.meta.url));

// 1. Approved numbers.
assert.equal(pricing.POSTER_MONTHLY_PRICE_GBP, 12.99);
assert.equal(pricing.INDIVIDUAL_PRICE_GBP, 14.99);
assert.deepEqual({ ...pricing.FLEET_PRICES_GBP }, { "2-5": 24.99, "6-15": 39.99, "16-30": 59.99, "31-55": 79.99 });
assert.deepEqual({ ...pricing.FLEET_PRICES_EUR }, { ...pricing.FLEET_PRICES_GBP }, "EUR tiers must match GBP numerically");
assert.equal(pricing.POSTER_MONTHLY_PRICE_EUR, pricing.POSTER_MONTHLY_PRICE_GBP);
assert.equal(pricing.INDIVIDUAL_PRICE_EUR, pricing.INDIVIDUAL_PRICE_GBP);
assert.deepEqual({ ...pricing.VERIFICATION_FEES }, { personAndCompany: 2.5, driverAndFirstVehicle: 3.5, additionalVehicle: 0.5 });

// 2. Tier boundaries.
const expectWeekly = [[1, 14.99], [2, 24.99], [5, 24.99], [6, 39.99], [15, 39.99], [16, 59.99], [30, 59.99], [31, 79.99], [55, 79.99], [56, null], [0, null]];
for (const [count, price] of expectWeekly) assert.equal(pricing.weeklyPriceForVehicleCount(count), price, `weekly price for ${count} vehicles`);
for (const count of [2, 5, 6, 15, 16, 30, 31, 55]) assert.equal(pricing.getFleetPrice(count), pricing.weeklyPriceForVehicleCount(count), `getFleetPrice(${count}) must agree`);
assert.equal(pricing.getIndividualWeeklyPrice(), 14.99);
assert.equal(pricing.getFleetPrice(2, { country: "IN", currency: "INR" }), null, "India must stay outside paid tiers");

// 3. Verification totals (driver-only path pays the Step 3 package, not the poster Step 2 fee).
assert.equal(pricing.driverVerificationTotal(1), 3.5);
assert.equal(pricing.driverVerificationTotal(5), 5.5);
assert.equal(pricing.driverVerificationTotal(55), 30.5);
assert.equal(pricing.driverVerificationTotal(0), null);

// 4. Fleet discount never exceeds the individual price per vehicle at the lowest count of a tier,
//    and every fleet tier is cheaper per vehicle than individuals (but not free).
for (const [range, price] of Object.entries(pricing.FLEET_PRICES_GBP)) {
  const low = Number(range.split("-")[0]);
  assert.ok(price < low * pricing.INDIVIDUAL_PRICE_GBP, `${range}: fleet must cost less than ${low} individuals`);
  assert.ok(price > pricing.INDIVIDUAL_PRICE_GBP, `${range}: fleet must cost more than one individual`);
}

// 5. Public plan list mirrors the constants.
const byKey = Object.fromEntries(pricing.PUBLIC_PLANS.map((plan) => [plan.key, plan]));
assert.equal(byKey.poster.amount, pricing.POSTER_MONTHLY_PRICE_GBP);
assert.equal(byKey.poster.period, "month");
assert.equal(byKey.individual.amount, pricing.INDIVIDUAL_PRICE_GBP);
assert.equal(byKey["fleet-31-55"].amount, pricing.FLEET_PRICES_GBP["31-55"]);

// 6. UI reads prices from lib/pricing.ts and discloses everything before signup.
const page = read("components/subscription-pricing.tsx");
const signup = read("app/signup/page.tsx");
const superseded = /\b(9\.99|16\.99|36\.99|49\.99)\b/;
for (const [name, src] of [["pricing page", page], ["signup", signup]]) {
  assert.doesNotMatch(src, superseded, `${name} must not contain superseded prices`);
  assert.doesNotMatch(src, /\b(12\.99|14\.99|24\.99|39\.99|59\.99|79\.99)\b/, `${name} must read prices from lib/pricing.ts, not hard-code them`);
}
assert.match(page, /from "@\/lib\/pricing"/);
assert.match(signup, /from "@\/lib\/pricing"/);
for (const phrase of ["Launch offers", "One-off verification fees", "What you will need", "Before you pay", "pays for the check, not for passing it", "owned or leased by the company", "waiting list", "checkout is not connected"]) {
  assert.ok(page.includes(phrase), `pricing page must disclose: ${phrase}`);
}
assert.match(signup, /href="\/pricing"/, "signup must link to the full cost disclosure before account creation");

// 7. Docs carry the approved matrix and no longer present the old conflict as open.
const policy = read("docs/PRODUCT_AND_VERIFICATION_POLICY.md");
for (const phrase of ["£12.99 / month", "£14.99 / 7 days", "£79.99 / 7 days", "6.7 Fleet integrity rules", "6.9 Transparency before signup", "6.10 Implementation status"]) {
  assert.ok(policy.includes(phrase), `policy must contain ${phrase}`);
}
for (const path of ["README.md", "docs/APP_WORKFLOWS_AND_DASHBOARDS.md", "docs/LAUNCH_READINESS.md"]) {
  assert.doesNotMatch(read(path), superseded, `${path} must not present superseded prices`);
}

console.log("Approved pricing contract passed: constants, tier boundaries, verification totals, UI disclosure and docs agree.");
