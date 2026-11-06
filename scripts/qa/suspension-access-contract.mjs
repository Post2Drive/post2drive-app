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
// Launch windows (2026-11-06): every POST/DRIVE evaluation runs preflight() first, which denies
// suspended accounts before any India, pilot, launch-window or subscription rule is applied.
const preflightSource = accessSource.slice(accessSource.indexOf("async function preflight"), accessSource.indexOf("function shape("));
assert.match(preflightSource, /getSuspendedAccountAccess\(account\)/, "preflight must apply the suspension guard");
for (const fn of ["export async function getPostAccess", "export async function getDriveAccess", "export async function getEntitlementStatus", "export async function getAccountAccess"]) {
  const body = accessSource.slice(accessSource.indexOf(fn));
  assert.ok(body.indexOf("await preflight(accountId)") >= 0 && body.indexOf("await preflight(accountId)") < body.indexOf("loadContext("),
    `${fn} must run the suspension preflight before evaluating market or launch-window rules`);
}
const waitlistWhere = accessSource.slice(accessSource.indexOf("function waitlistEligibleWhere"), accessSource.indexOf("async function regionCounts"));
assert.match(waitlistWhere, /verificationStatus: "verified"/,
  "suspended accounts must not count toward or hold driver waitlist places (only person-verified accounts do)");

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
assert.ok(
  createPaymentSource.includes('FROM "Account" WHERE "id" = $1 FOR UPDATE'),
  "subscription payment creation must lock the account row against concurrent deletion or suspension",
);
assert.ok(
  createPaymentSource.indexOf('FROM "Account" WHERE "id" = $1 FOR UPDATE') <
    createPaymentSource.indexOf("tx.account.findUnique") &&
    createPaymentSource.indexOf("tx.account.findUnique") < createPaymentSource.indexOf("tx.subscriptionPayment.create"),
  "payment creation must lock and re-read the account before inserting the pending payment",
);
assert.match(confirmPaymentSource, /account\.verificationStatus === "suspended"/,
  "a delayed payment webhook must not activate a subscription for a suspended account");
assert.ok(
  confirmPaymentSource.indexOf('account.verificationStatus === "suspended"') < confirmPaymentSource.indexOf("tx.account.update"),
  "subscription confirmation must check fresh locked account suspension state before granting paid access",
);
assert.match(confirmPaymentSource, /account\.deletionRequestedAt/,
  "a delayed payment webhook must not activate a subscription for a deletion-requested account");
const createPaymentRoute = readFileSync("app/api/subscription/create-payment/route.ts", "utf8");
assert.match(createPaymentRoute, /"Account is suspended\."/,
  "subscription API must expose a controlled suspended-account denial");
assert.ok(createPaymentRoute.includes('"Account is pending deletion."'),
  "subscription API must expose a controlled deletion-requested denial");
assert.ok(createPaymentRoute.includes('["Account is suspended.", "Account is pending deletion."]'),
  "suspended and deletion-requested access errors must map to HTTP 403");
// lib/promotion.ts was removed with the launch-window change: verification no longer starts any
// per-account free period, so there is no delayed side effect that could grant a suspended account access.
assert.ok(!readFileSync("lib/verification.ts", "utf8").includes("startPromotionForVerifiedAccount"),
  "verification must not start a per-account promotion");

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
