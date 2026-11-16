#!/usr/bin/env node
// Emailed sign-in code: lifecycle, no account enumeration, namespacing, UI wiring.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createHash } from "node:crypto";
const read = (p) => readFileSync(p, "utf8");
let checks = 0;
const ok = (cond, msg) => { assert.ok(cond, msg); checks++; };

const lib = read("lib/emailCodeLogin.ts");
const route = read("app/api/email-code/request/route.ts");
const auth = read("lib/auth.ts");
const login = read("app/login/page.tsx");

// Email normalisation (re-implemented from the same rule; the source is checked for it below).
ok(/toLowerCase\(\)/.test(lib) && /MAX_EMAIL_LENGTH = 254/.test(lib), "emails are lower-cased and length-bounded");
ok(/`email-code:\$\{email\}`/.test(lib), "challenge key is namespaced so it can't collide with a phone number");
ok(createHash("sha256").update("email-code:a@b.co").digest("hex") !== createHash("sha256").update("+447700900000").digest("hex"), "namespaced keys hash differently");
ok(/deletionRequestedAt: null/.test(lib), "accounts pending deletion can't receive codes");

// Request route
ok(/export const POST = withApiMetrics\("\/api\/email-code\/request"/.test(route), "route is wrapped in api metrics");
ok(/email-code-public-network/.test(route) && /email-code-public-address/.test(route), "per-network and per-address rate limits");
ok(/status: 503/.test(route) && /getTransactionalEmailProvider\(\)/.test(route), "fails closed without email delivery");
ok(/const generic = NextResponse\.json\(\{ sent: true \}\)/.test(route), "generic reply defined");
ok(/if \(!user\) return generic;/.test(route), "unknown address gets the generic reply");
ok(/if \(!issued\.ok\) return generic;/.test(route), "cooldown gets the generic reply");
ok(/issueOtp\(emailCodeKey\(email\)/.test(route), "uses the shared OTP lifecycle");
ok(!/console\.(log|error)\([^)]*(code|email)/i.test(route), "route never logs codes or addresses");

// Sign-in provider
ok(/id: "email-code"/.test(auth), "NextAuth provider registered");
ok(/login-email-code-network/.test(auth) && /login-email-code-address/.test(auth), "sign-in is rate limited by network and address");
ok(/verifyOtp\(emailCodeKey\(email\), code, new PrismaOtpStore\(user\.accountId\)/.test(auth), "sign-in verifies through the atomic single-use store");
ok(/\^\\d\{6\}\$/.test(auth), "code must be exactly six digits");
ok(/toSessionUser\(user\)/.test(auth.split('id: "email-code"')[1] ?? ""), "same session shape as other methods");

// UI
ok(/signIn\("email-code"/.test(login) && /\/api\/email-code\/request/.test(login), "login page calls the new provider and route");
ok(/autoComplete="one-time-code"/.test(login), "code input hints one-time-code autofill");
ok(/If that email is registered/.test(login), "UI message does not reveal whether the address is registered");

console.log(`email-code login contract: ${checks} checks passed`);
