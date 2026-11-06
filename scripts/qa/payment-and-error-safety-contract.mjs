#!/usr/bin/env node
// Issue #38 contract: no implied charges without a provider, webhook binding,
// no leaky logs/errors, and bounded request bodies. Source-level and hermetic.
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const read = p => readFileSync(p, "utf8");
function walk(dir, out = []) {
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) walk(p, out); else if (/\.(ts|tsx)$/.test(name)) out.push(p);
  }
  return out;
}
const stripNoise = src => src
  .replace(/\/\*[\s\S]*?\*\//g, "").replace(/(^|[^:])\/\/.*$/gm, "$1")
  .replace(/"(?:[^"\\\n]|\\.)*"/g, '""').replace(/'(?:[^'\\\n]|\\.)*'/g, "''")
  .replace(/`(?:[^`\\]|\\.)*`/g, "``");

// 1. Payment surfaces never imply a charge while no provider is connected.
const provider = read("lib/paymentProvider.ts");
assert.match(provider, /PAYMENT_PROVIDER_CONNECTED = false/, "provider flag must default to not connected");
assert.match(provider, /Nothing has been charged/, "notice must say nothing is charged");
const create = read("app/api/subscription/create-payment/route.ts");
assert.match(create, /providerConnected: PAYMENT_PROVIDER_CONNECTED/);
assert.match(create, /charged: false/, "pending payment response must state charged:false");
assert.match(create, /notice: NO_PROVIDER_NOTICE/);
const payments = read("app/api/payments/route.ts");
assert.match(payments, /trackingOnly: true/, "payments API must declare tracking-only");
assert.match(payments, /notice: NO_PROVIDER_NOTICE/);
assert.match(read("app/payments/page.tsx"), /Payment tracking only\. The platform does not process,/, "payments page must keep tracking-only wording");
assert.match(read("app/pricing/page.tsx"), /nothing is charged today/i, "pricing page must say nothing is charged");

// 2. Subscription webhook binds the event to the payment and rejects bad transitions.
const webhook = read("app/api/subscription/webhook/route.ts");
assert.match(webhook, /providerPaymentId is required/, "webhook must require the provider payment reference");
assert.match(webhook, /expectedAccountId: body\.accountId/);
assert.match(webhook, /P2002/, "provider-reference collisions must be a 409, not a 500");
assert.match(webhook, /Unknown subscription payment/, "unknown payment must be a 404");
const sub = read("lib/subscription.ts");
const confirm = sub.slice(sub.indexOf("export async function confirmSubscriptionPayment"));
assert.match(confirm, /Subscription event does not match the payment/, "account/amount/currency binding");
assert.match(confirm, /details\?\.providerPaymentId !== payment\.providerPaymentId/, "paid replay must carry the same provider reference");
assert.match(confirm, /payment\.status !== "pending"\) throw/, "only pending payments can be confirmed");

// 3. Logs and error responses cannot leak raw errors, credentials, tokens or PII.
const files = [...walk("app/api"), ...walk("lib")];
const logCall = /console\.(?:log|info|warn|error|debug)\(([^;]*?)\);/gs;
for (const file of files) {
  const raw = read(file);
  const src = stripNoise(raw);
  for (const m of src.matchAll(logCall)) {
    const args = m[1];
    assert.doesNotMatch(args, /[(,]\s*(?:error|err|e|sendError|signupError)\s*[,)]/, `${file}: raw exception passed to a log call`);
    assert.doesNotMatch(args, /\b(?:password|passwordHash|token|tokenHash|secret|otp|licenceHash|email|phone|authorization|cookie)\b/i, `${file}: log call references a credential/PII identifier`);
  }
  assert.doesNotMatch(src, /JSON\.stringify\(\s*(?:error|err|e)\s*\)|String\(\s*(?:error|err|e)\s*\)/, `${file}: raw exception serialised`);
  if (file.startsWith("app/api")) {
    // error.message may only be echoed behind an explicit allow-list (create-payment) or from typed eligibility results.
    for (const m of src.matchAll(/\berror:\s*((?:\w+\.)*message)\b/g)) {
      assert.ok(
        (file.endsWith("subscription/create-payment/route.ts") && m[1] === "error.message") ||
        (file.endsWith("ratings/route.ts") && m[1] === "eligibility.message"),
        `${file}: response echoes ${m[1]}`,
      );
    }
    assert.doesNotMatch(src, /\b(?:req|request)\.json\(\)/, `${file}: unbounded request.json(); use readBoundedJson`);
  }
}
assert.match(read("lib/jobValidation.ts"), /class JobInputError/, "job validation must only surface its own typed messages");
assert.doesNotMatch(read("lib/jobValidation.ts"), /error instanceof Error \? error\.message/, "job validation must not echo arbitrary exceptions");

console.log("Payment-and-error-safety contract passed.");
