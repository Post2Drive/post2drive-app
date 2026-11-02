#!/usr/bin/env node
// Issue #123: India phone-based login and recovery.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const read = (p) => readFileSync(p, "utf8");

const auth = read("lib/auth.ts");
const lookup = read("lib/phoneLogin.ts");
const request = read("app/api/phone-otp/request/route.ts");
const reset = read("app/api/phone-otp/reset/route.ts");
const migration = read("prisma/migrations/20261102010000_user_phone_e164/migration.sql");

// Lookup: normalised, India-only, unambiguous, not pending deletion.
assert.match(lookup, /toE164ForMarket\(input, "IN"\)/);
assert.match(lookup, /account: \{ country: "IN", currency: "INR", deletionRequestedAt: null \}/);
assert.match(lookup, /matches\.length === 1 \? matches\[0\] : null/, "duplicate numbers must fail closed");

// Login provider: rate limited before verifying, one shared session shape.
assert.match(auth, /id: "phone-otp"/);
const provider = auth.slice(auth.indexOf('id: "phone-otp"'));
assert.ok(provider.indexOf('scope: "login-otp-network"') < provider.indexOf("verifyOtp("), "rate limits run before the code check");
assert.match(provider, /new PrismaOtpStore\(user\.accountId\)/, "codes are scoped to the account that owns the number");
assert.match(provider, /return toSessionUser\(user\);/);
assert.equal((auth.match(/return toSessionUser\(user\);/g) || []).length, 2, "password and code logins build identical sessions");

// Public request: no account enumeration, codes only to registered numbers.
const genericAt = request.indexOf("const generic = ");
assert.ok(genericAt > 0 && request.indexOf("if (!user) return generic;") > genericAt, "unknown numbers get the same reply as registered ones");
assert.match(request, /if \(!issued\.ok\) return generic;/, "a cooldown must answer exactly like a send");
assert.match(request, /scope: "phone-otp-public-network"/);
assert.match(request, /scope: "phone-otp-public-number", identity: e164/);
for (const response of request.split("NextResponse.json(").slice(1).map((part) => part.split(");")[0])) {
  assert.doesNotMatch(response, /codeForDelivery|accountId|user\./, "responses never include the code or account details");
}

// Reset: same password rules, signs out every session, generic failures.
assert.match(reset, /Buffer\.byteLength\(password, "utf8"\) > 72/);
assert.match(reset, /sessionVersion: \{ increment: 1 \}/, "a reset must revoke existing sessions");
assert.match(reset, /passwordResetToken\.deleteMany\(\{ where: \{ userId: user\.id \} \}\)/);
assert.match(reset, /if \(!e164 \|\| !user \|\| !pepper \|\| !\/\^\\d\{6\}\$\/\.test\(code\)\) return NextResponse\.json\(INVALID/, "unknown numbers fail like wrong codes");

// Stored numbers stay normalised.
assert.match(read("app/api/signup/route.ts"), /phoneE164: toE164ForMarket\(phone, country\)/);
assert.match(read("app/api/account/route.ts"), /phoneE164: toE164ForMarket\(phone, account\.country\)/);
assert.match(migration, /a\."country" = 'IN'[\s\S]*\^\(91\|0\)\?\[6-9\]\[0-9\]\{9\}\$/, "India backfill accepts only valid mobiles");

// The default login button keeps a unique accessible name (CI clicks "Log in").
const login = read("app/login/page.tsx");
assert.doesNotMatch(login, />[^<]*\blog in\b[^<]*text code[^<]*</i, "toggle text must not contain 'Log in'");

console.log("Phone login contract passed: normalised lookup, rate-limited OTP login, no enumeration, session-revoking reset.");
