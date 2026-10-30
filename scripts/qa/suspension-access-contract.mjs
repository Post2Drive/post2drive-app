#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { getSuspendedAccountAccess } from "../../lib/accessPolicy.ts";

const suspendedIndia = {
  id: "india-suspended",
  country: "IN",
  currency: "INR",
  phoneVerifiedAt: new Date("2026-10-01T00:00:00.000Z"),
  isTester: false,
  verificationStatus: "suspended",
};
const suspendedUkTester = {
  id: "uk-suspended-tester",
  country: "GB",
  currency: "GBP",
  phoneVerifiedAt: null,
  isTester: true,
  verificationStatus: "suspended",
};
const suspendedNonWeekly = {
  id: "non-weekly-suspended",
  country: "US",
  currency: "USD",
  phoneVerifiedAt: null,
  isTester: false,
  subscriptionStatus: "active",
  verificationStatus: "suspended",
};

for (const account of [suspendedIndia, suspendedUkTester, suspendedNonWeekly]) {
  const access = getSuspendedAccountAccess(account);
  assert.deepEqual(access, {
    allowed: false,
    reason: "account_suspended",
    account,
  }, "suspended account must be denied regardless of market, phone verification, tester status, or subscription");
}

const activeIndia = { ...suspendedIndia, id: "india-active", verificationStatus: "verified" };
const activeUkTester = { ...suspendedUkTester, id: "uk-active-tester", verificationStatus: "pending" };
assert.equal(getSuspendedAccountAccess(activeIndia), null, "active India account must not be blocked by the suspension guard");
assert.equal(getSuspendedAccountAccess(activeUkTester), null, "active tester account must not be blocked by the suspension guard");

const accessSource = readFileSync("lib/access.ts", "utf8");
const firstGuard = accessSource.indexOf("getSuspendedAccountAccess(account)");
const indiaBranch = accessSource.indexOf('if (account.country === "IN" && account.currency === "INR")');
assert.ok(firstGuard >= 0 && firstGuard < indiaBranch,
  "suspension must be checked before the India phone-only access path");
const refreshAccount = accessSource.indexOf("account = await prisma.account.findUnique");
const secondGuard = accessSource.indexOf("getSuspendedAccountAccess(account)", firstGuard + 1);
assert.ok(refreshAccount >= 0 && secondGuard > refreshAccount,
  "suspension must be rechecked after refreshing account state following trial-cycle evaluation");

console.log("Suspension access contract passed: suspended India, UK tester, and subscribed non-weekly accounts are denied; active accounts retain their normal market rules.");
