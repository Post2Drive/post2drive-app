#!/usr/bin/env node
// Run with: node --experimental-strip-types scripts/qa/phone-otp-contract.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");

// ---- Number normalisation (pure) -------------------------------------------
const phoneSource = read("lib/phoneVerification.ts");
const pick = (name) => phoneSource.match(new RegExp(`export function ${name}\\([\\s\\S]*?\\n}\\n`))?.[0];
const stripTypes = (code) => code
  .replace(/^export /, "")
  .replace(/\(value: unknown, marketCountry: string \| null \| undefined\): string \| null/, "(value, marketCountry)")
  .replace(/\(value: unknown\): string \| null/, "(value)")
  .replace(/\(e164: string\): string/, "(e164)");
const E164_PATTERN = /^\+[1-9]\d{7,14}$/;
const helpers = new Function("E164_PATTERN", `${stripTypes(pick("normalizeE164Phone"))}; ${stripTypes(pick("toE164ForMarket"))}; ${stripTypes(pick("maskPhone"))}; return { toE164ForMarket, maskPhone };`)(E164_PATTERN);
const { toE164ForMarket, maskPhone } = helpers;

assert.equal(toE164ForMarket("98765 43210", "IN"), "+919876543210");
assert.equal(toE164ForMarket("098765-43210", "IN"), "+919876543210");
assert.equal(toE164ForMarket("+91 98765 43210", "IN"), "+919876543210");
assert.equal(toE164ForMarket("07700 900123", "GB"), "+447700900123");
assert.equal(toE164ForMarket("+44 7700 900123", "IN"), "+447700900123", "an explicit +code is kept whatever the market");
assert.equal(toE164ForMarket("12345", "IN"), null, "too short");
assert.equal(toE164ForMarket("5876543210", "IN"), null, "Indian mobiles start 6-9");
assert.equal(toE164ForMarket("9876543210", "US"), null, "no guessing for markets without local rules");
assert.equal(maskPhone("+919876543210"), "+91 ••••• ••210", "only the last three digits are shown");

// ---- OTP lifecycle with the in-memory store --------------------------------
const lifecycle = await import("../../lib/providerLifecycle.ts");
const { issueOtp, verifyOtp, InMemoryOtpStore, OTP_TTL_MS, OTP_MAX_ATTEMPTS } = lifecycle;
const pepper = "x".repeat(40);
const phone = "+919876543210";
let now = 1_800_000_000_000;

let store = new InMemoryOtpStore();
const issued = await issueOtp(phone, store, { pepper, providerConfigured: true, now, generateCode: () => "123456" });
assert.ok(issued.ok);
const stored = await store.get(issued.challenge.phoneHash);
assert.ok(!JSON.stringify(stored).includes("123456") && !JSON.stringify(stored).includes(phone), "store holds hashes only, never the code or number");
assert.equal((await issueOtp(phone, store, { pepper, providerConfigured: true, now: now + 1000 })).ok, false, "60-second resend cooldown");
assert.equal(await verifyOtp(phone, "000000", store, { pepper, now }), false);
assert.equal(await verifyOtp(phone, "123456", store, { pepper, now }), true);
assert.equal(await verifyOtp(phone, "123456", store, { pepper, now }), false, "a code works once");

store = new InMemoryOtpStore();
await issueOtp(phone, store, { pepper, providerConfigured: true, now, generateCode: () => "222222" });
assert.equal(await verifyOtp(phone, "222222", store, { pepper, now: now + OTP_TTL_MS + 1 }), false, "expired after 5 minutes");

store = new InMemoryOtpStore();
await issueOtp(phone, store, { pepper, providerConfigured: true, now, generateCode: () => "333333" });
for (let i = 0; i < OTP_MAX_ATTEMPTS; i++) await verifyOtp(phone, "999999", store, { pepper, now });
assert.equal(await verifyOtp(phone, "333333", store, { pepper, now }), false, "locked after too many wrong guesses");

// ---- Server wiring guarantees ----------------------------------------------
const otpStore = read("lib/otpStore.ts");
assert.match(otpStore, /row\.accountId !== this\.accountId\) return null/, "a challenge is only visible to the account that requested it");
assert.match(otpStore, /updateMany\(\{[\s\S]*?consumedAt: null,[\s\S]*?expiresAt: \{ gt:[\s\S]*?attempts: \{ lt: OTP_MAX_ATTEMPTS \}[\s\S]*?\}\);\s*return result\.count === 1;/,
  "consumption must be one conditional update so a code can't be used twice concurrently");

const session = read("lib/phoneOtpSession.ts");
assert.match(session, /toE164ForMarket\(account\.users\[0\]\?\.phone, account\.country\)/, "the number comes from the database, not the request");
const request = read("app/api/account/phone/request/route.ts");
assert.doesNotMatch(request, /readBoundedJson|request\.json\(\)/, "the request endpoint must not accept a phone number from the client");
assert.match(request, /scope: "phone-otp-request-network"/);
assert.match(request, /scope: "phone-otp-request-account", identity: context\.accountId/);
assert.match(request, /if \(!provider \|\| !pepper\)[\s\S]*?status: 503/, "fails closed with no SMS adapter");
for (const response of request.split("NextResponse.json(").slice(1).map((part) => part.split(");")[0])) {
  assert.doesNotMatch(response, /codeForDelivery|issued\.challenge\.codeHash/, "the code must never be returned to the browser");
}
assert.match(request, /provider\.sendOtp\(\{ toE164: context\.phone, code: issued\.codeForDelivery/, "the code goes only to the SMS adapter");

const sms = read("lib/smsProvider.ts");
assert.match(sms, /DEPLOYMENT_ENVIRONMENT\?\.trim\(\)\.toLowerCase\(\) === "production"\) return false/, "sandbox can never run in production");
assert.match(sms, /return isStagingTestPhoneVerificationEnabled\(\);/, "sandbox also needs the staging QA guard");
assert.match(sms, /if \(isSmsSandboxEnabled\(\)\) return sandboxSmsProvider;\s*return null;/, "no implicit fallback provider");

const account = read("app/api/account/route.ts");
assert.match(account, /if \(phoneChanged && account\.phoneVerifiedAt\) \{\s*accountData\.phoneVerifiedAt = null;/, "changing the number clears verification");
const outbox = read("app/admin/sms-outbox/page.tsx");
assert.match(outbox, /if \(!\(await isTesterAdmin\(\)\)\) redirect/, "the test outbox is admin-only");

console.log("Phone OTP contract passed: E.164 normalisation, hashed single-use expiring codes, account scoping, client cannot choose the number, sandbox never in production.");
