import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  InMemoryOtpStore,
  issueOtp,
  verifyOtp,
  OTP_MAX_ATTEMPTS,
  OTP_TTL_MS,
  OTP_RESEND_COOLDOWN_MS,
  applyVerifiedPaymentEvent,
} from "../../lib/providerLifecycle.ts";

const now = 1_800_000_000_000;
const store = new InMemoryOtpStore();
const options = { now, pepper: "test-only-pepper", providerConfigured: true, generateCode: () => "123456" };

const unconfigured = await issueOtp("+919876543210", store, { ...options, providerConfigured: false });
assert.deepEqual(unconfigured, { ok: false, reason: "provider_unconfigured" }, "unconfigured SMS must fail closed");
const issued = await issueOtp("+919876543210", store, options);
assert.equal(issued.ok, true, "configured test adapter should issue a challenge");
if (!issued.ok) throw new Error("expected issued OTP");
assert.equal(issued.challenge.expiresAt, now + OTP_TTL_MS);
assert.equal(issued.challenge.codeHash.includes("123456"), false, "stored OTP must not be plaintext");
const cooldown = await issueOtp("+919876543210", store, options);
assert.deepEqual(cooldown, { ok: false, reason: "cooldown" }, "resend must be throttled");
assert.equal(await verifyOtp("+919876543210", "999999", store, { now, pepper: options.pepper }), false);
assert.equal(await verifyOtp("+919876543210", "123456", store, { now: now + OTP_RESEND_COOLDOWN_MS, pepper: options.pepper }), true);
assert.equal(await verifyOtp("+919876543210", "123456", store, { now: now + OTP_RESEND_COOLDOWN_MS + 1, pepper: options.pepper }), false, "OTP must be single-use");

const expiredStore = new InMemoryOtpStore();
const expired = await issueOtp("+919876543211", expiredStore, { ...options, generateCode: () => "222222" });
assert.equal(expired.ok, true);
assert.equal(await verifyOtp("+919876543211", "222222", expiredStore, { now: now + OTP_TTL_MS, pepper: options.pepper }), false, "expired OTP must fail");

const attemptsStore = new InMemoryOtpStore();
const attempt = await issueOtp("+919876543212", attemptsStore, { ...options, generateCode: () => "333333" });
assert.equal(attempt.ok, true);
for (let i = 0; i < OTP_MAX_ATTEMPTS; i++) {
  await verifyOtp("+919876543212", "000000", attemptsStore, { now: now + OTP_RESEND_COOLDOWN_MS, pepper: options.pepper });
}
assert.equal(await verifyOtp("+919876543212", "333333", attemptsStore, { now: now + OTP_RESEND_COOLDOWN_MS, pepper: options.pepper }), false, "attempt limit must lock challenge");

const paymentSource = readFileSync("lib/providerLifecycle.ts", "utf8");
assert.ok(paymentSource.includes("applyVerifiedPaymentEvent"), "payment event boundary must be present");
const events = new Set();
const paymentStore = {
  async hasProcessed(provider, eventId) { return events.has(provider + ":" + eventId); },
  async applyOnce(input) {
    const key = input.provider + ":" + input.eventId;
    if (events.has(key)) return "duplicate";
    events.add(key);
    return "applied";
  },
};
const payment = {
  provider: "test-provider", eventId: "evt-1", paymentId: "pay-1",
  expectedAmountMinorUnits: 999, expectedCurrency: "GBP",
  receivedAmountMinorUnits: 999, receivedCurrency: "GBP",
  verified: true, transition: "paid",
};
assert.equal(await applyVerifiedPaymentEvent(paymentStore, payment), "applied");
assert.equal(await applyVerifiedPaymentEvent(paymentStore, payment), "duplicate", "webhook replay must be idempotent");
assert.equal(await applyVerifiedPaymentEvent(paymentStore, { ...payment, eventId: "evt-2", verified: false }), "rejected", "unverified events must never change state");
assert.equal(await applyVerifiedPaymentEvent(paymentStore, { ...payment, eventId: "evt-3", receivedAmountMinorUnits: 1 }), "rejected", "amount mismatch must fail closed");
assert.equal(await applyVerifiedPaymentEvent(paymentStore, { ...payment, eventId: "evt-4", receivedCurrency: "INR" }), "rejected", "currency mismatch must fail closed");

const emailSource = readFileSync("lib/emailVerification.ts", "utf8");
assert.ok(emailSource.includes("TOKEN_LIFETIME_MS = 24 * 60 * 60 * 1000"), "email verification lifetime must remain 24 hours");
assert.ok(emailSource.includes("hashEmailVerificationToken"), "email token hashes must remain");
assert.ok(emailSource.includes("usedAt: null"), "email token single-use guard must remain");
assert.ok(emailSource.includes("country !== \"IN\" && emailVerificationEnabled()"), "India must remain exempt from required email verification");
console.log(JSON.stringify({ status: "passed", checks: 18 }, null, 2));
