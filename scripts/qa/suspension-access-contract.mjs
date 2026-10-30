#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
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

const subscriptionSource = readFileSync("lib/subscription.ts", "utf8");
const createPaymentSource = subscriptionSource.slice(
  subscriptionSource.indexOf("export async function createPendingSubscriptionPayment"),
  subscriptionSource.indexOf("export async function confirmSubscriptionPayment"),
);
const confirmPaymentSource = subscriptionSource.slice(
  subscriptionSource.indexOf("export async function confirmSubscriptionPayment"),
);
assert.match(createPaymentSource, /verificationStatus === "suspended"/,
  "suspended accounts must not create new subscription payment requests, including tester accounts");
assert.ok(
  createPaymentSource.indexOf('verificationStatus === "suspended"') < createPaymentSource.indexOf("isWeeklyPricingEligible(account)"),
  "subscription creation must check suspension before market or tester eligibility",
);
assert.match(confirmPaymentSource, /payment\.account\.verificationStatus === "suspended"/,
  "a delayed payment webhook must not activate a subscription for a suspended account");
assert.ok(
  confirmPaymentSource.indexOf('payment.account.verificationStatus === "suspended"') < confirmPaymentSource.indexOf("tx.account.update"),
  "subscription confirmation must check suspension before granting paid access",
);
const createPaymentRoute = readFileSync("app/api/subscription/create-payment/route.ts", "utf8");
assert.match(createPaymentRoute, /"Account is suspended\."/,
  "subscription API must expose a controlled suspended-account denial");

const jobMarketSource = readFileSync("lib/jobMarket.ts", "utf8");
assert.match(jobMarketSource, /verificationStatus:\s*true/,
  "job-market guard must load the account suspension state");
const jobSuspensionGuard = jobMarketSource.indexOf("getSuspendedAccountAccess(actor)");
const jobDeletionGuard = jobMarketSource.indexOf("if (actor.deletionRequestedAt)");
const supportedMarketGuard = jobMarketSource.indexOf("if (!isSupportedMarket(actor))");
assert.ok(jobSuspensionGuard >= 0 && jobSuspensionGuard < jobDeletionGuard && jobSuspensionGuard < supportedMarketGuard,
  "job-market routes must reject suspension before deletion and supported-market checks");
assert.match(jobMarketSource, /code:\s*"ACCOUNT_SUSPENDED"/,
  "job-market APIs must return a stable suspended-account denial");

// Vehicle GET remains available to the owner for account/status purposes, but
// a suspended account cannot register a new vehicle or enter the driver pool.
const vehicleRoute = readFileSync("app/api/vehicles/route.ts", "utf8");
const vehiclePost = vehicleRoute.slice(vehicleRoute.indexOf("async function POSTHandler"));
const vehicleSuspensionGuard = vehiclePost.indexOf('account.verificationStatus === "suspended"');
const vehicleMutation = vehiclePost.indexOf("prisma.$transaction");
assert.ok(vehicleSuspensionGuard >= 0 && vehicleSuspensionGuard < vehicleMutation,
  "vehicle registration must reject suspension before any vehicle mutation");
assert.match(vehiclePost, /Suspended accounts cannot register vehicles/);

// Execute the real shared job-market guard with isolated Prisma and market
// dependencies. This verifies the actual denial response, not just its source.
const compiledJobMarket = ts.transpileModule(jobMarketSource, {
  compilerOptions: {
    module: ts.ModuleKind.CommonJS,
    target: ts.ScriptTarget.ES2022,
    esModuleInterop: true,
  },
  fileName: "lib/jobMarket.ts",
}).outputText;
let actorFixture = { ...suspendedIndia, deletionRequestedAt: null };
const fakePrisma = {
  account: { findUnique: async () => actorFixture },
  job: {
    findUnique: async () => ({
      currency: "INR",
      crossBorder: false,
      poster: { country: "IN", currency: "INR" },
    }),
  },
};
const module = { exports: {} };
const mockRequire = (name) => {
  if (name === "@/lib/prisma") return { prisma: fakePrisma };
  if (name === "next/server") return { NextResponse: { json: (body, init = {}) => ({ body, status: init.status ?? 200 }) } };
  if (name === "@/lib/market") return {
    isSupportedMarket: () => true,
    marketTimeZone: () => "Asia/Kolkata",
    sameMarket: () => true,
  };
  if (name === "@/lib/accessPolicy") return { getSuspendedAccountAccess };
  throw new Error("Unexpected job-market test dependency: " + name);
};
vm.runInNewContext(compiledJobMarket, {
  module,
  exports: module.exports,
  require: mockRequire,
  Promise,
}, { filename: "lib/jobMarket.ts" });
const { checkJobMarket } = module.exports;
const suspendedJobCheck = await checkJobMarket("india-suspended", "fixture-job");
assert.equal(suspendedJobCheck.ok, false, "suspended account must fail the real job-market guard");
assert.equal(suspendedJobCheck.status, 403, "suspended account must receive HTTP 403");
assert.equal(suspendedJobCheck.code, "ACCOUNT_SUSPENDED", "suspended account must receive stable denial code");
actorFixture = { ...activeIndia, deletionRequestedAt: null };
const activeJobCheck = await checkJobMarket("india-active", "fixture-job");
assert.equal(activeJobCheck.ok, true, "active India account must retain job-market access");

console.log("Suspension access contract passed: suspended India, UK tester, and subscribed non-weekly accounts are denied; active accounts retain their normal market rules; vehicle registration is blocked.");
