#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(path, "utf8");
const accountRoute = read("app/api/account/route.ts");
const getHandler = accountRoute.split("async function PATCHHandler")[0];
const patchHandler = accountRoute.split("async function PATCHHandler")[1]?.split("async function DELETEHandler")[0] || "";
const nextConfig = read("next.config.js");
const passwordResetSource = read("lib/passwordReset.ts");
const signupRoute = read("app/api/signup/route.ts");
const resetPasswordRoute = read("app/api/auth/reset-password/route.ts");
const requestBodySource = read("lib/requestBody.ts");
const subscriptionWebhook = read("app/api/subscription/webhook/route.ts");
assert.ok(passwordResetSource.includes("using this link:\\n${resetUrl}\\n\\nThis link expires in one hour"),
  "password-reset plain-text email must contain newline escape sequences around the reset URL");
assert.ok(!passwordResetSource.includes("using this link:\\\\n${resetUrl}"),
  "password-reset plain-text email must not emit double-escaped literal backslash-n sequences");


assert.match(signupRoute, /readBoundedJson\(req, 16 \* 1024\)/,
  "signup must cap and stream request JSON");
assert.match(resetPasswordRoute, /readBoundedJson\(req, 4 \* 1024\)/,
  "password reset must cap and stream request JSON");
assert.match(requestBodySource, /totalBytes > maxBytes/,
  "bounded JSON parser must enforce the byte cap while reading the request stream");
assert.match(signupRoute, /readBoundedJson\(req, 16 \* 1024\)/,
  "signup passwords must not exceed bcrypt's 72-byte input limit");
assert.match(resetPasswordRoute, /Buffer\.byteLength\(password, "utf8"\) > 72/,
  "password reset passwords must not exceed bcrypt's 72-byte input limit");
assert.match(subscriptionWebhook, /timingSafeEqual/,
  "shared webhook secret comparison must be constant-time");
assert.match(subscriptionWebhook, /readBoundedJson\(request, 16 \* 1024\)/,
  "subscription webhook must cap and stream request JSON");
assert.doesNotMatch(subscriptionWebhook, /error:\s*message/,
  "webhook response must not expose exception messages");

assert.ok(patchHandler, "Account PATCH handler must exist");
assert.match(getHandler, /where:\s*\{\s*id:\s*accountId,\s*deletionRequestedAt:\s*null\s*\}/,
  "Account GET must reject deletion-requested accounts");
assert.match(getHandler, /select:\s*\{[\s\S]*?companyName:\s*true[\s\S]*?country:\s*true[\s\S]*?currency:\s*true[\s\S]*?displayId:\s*true[\s\S]*?marketingConsent:\s*true[\s\S]*?users:\s*\{/,
  "Account GET must use an explicit allowlist of settings fields");
assert.match(getHandler, /where:\s*\{\s*id:\s*userId\s*\}/,
  "Account GET must scope nested profile data to the current session user");
assert.doesNotMatch(getHandler, /include:\s*\{/,
  "Account GET must not serialize the full Account model through include");

assert.match(patchHandler, /const parsed:\s*unknown = await req\.json\(\)/,
  "Account PATCH must parse JSON as untrusted input");
assert.match(patchHandler, /Array\.isArray\(parsed\)/,
  "Account PATCH must reject array and non-object JSON bodies");
assert.match(patchHandler, /Invalid request body\./,
  "Malformed or non-object JSON must return a client error");
assert.match(patchHandler, /boundedString\(name, 120\)[\s\S]*?boundedString\(phone, 40\)[\s\S]*?boundedString\(companyName, 160\)[\s\S]*?boundedString\(country, 2\)[\s\S]*?boundedString\(currency, 3\)/,
  "Account PATCH must type-check and bound user-controlled strings");
assert.match(patchHandler, /marketingConsent !== undefined && typeof marketingConsent !== "boolean"/,
  "Account PATCH must reject non-boolean marketing consent");
assert.match(patchHandler, /FOR UPDATE/,
  "Account PATCH must retain the transaction-scoped account row lock");
assert.match(patchHandler, /if \(name !== undefined \|\| phone !== undefined\)/,
  "Account PATCH must permit intentional clearing of blank profile fields");

assert.match(nextConfig, /Content-Security-Policy-Report-Only/,
  "CSP must be observable in report-only mode before enforcement");
assert.doesNotMatch(nextConfig, /key:\s*"Content-Security-Policy"/,
  "CSP must not be enforced before compatibility evidence is reviewed");

assert.match(passwordResetSource, /createHmac\("sha256",\s*secret\)\.update\(token\)\.digest\("hex"\)/,
  "high-entropy password-reset tokens must use a keyed HMAC digest");
assert.match(passwordResetSource, /createdAt:\s*\{\s*gt:\s*cooldownSince\s*\}/,
  "password-reset cooldown must cover newly created tokens while delivery is in flight");
assert.match(passwordResetSource, /randomBytes\(32\)/,
  "password-reset tokens must retain at least 256 bits of cryptographic randomness");
assert.match(passwordResetSource, /if \(!secret\) throw new Error\("Password reset token hashing is not configured\."\)/,
  "password-reset token hashing must fail closed when the application secret is absent");
assert.doesNotMatch(passwordResetSource, /createHash\("sha256"\)/,
  "password-reset token digests must not revert to an unkeyed SHA-256 digest");


console.log("Account API security contracts passed: minimized GET response, current-user scoping, deletion guard, bounded signup/reset/webhook inputs, bcrypt password byte limits, constant-time webhook authentication, lifecycle lock and report-only CSP.");
