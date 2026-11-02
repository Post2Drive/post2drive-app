#!/usr/bin/env node
// Run with: node --experimental-strip-types scripts/qa/admin-ratelimit-security-contract.mjs
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// ---- Rate-limit identity: only the edge-overwritten header is trusted ----
const { clientNetworkIdentity, trustedClientIpHeader } = await import("../../lib/clientIp.ts");
const req = (headers) => new Request("https://example.test/api/auth", { headers });
const railway = {};

assert.equal(trustedClientIpHeader(railway), "x-real-ip", "Railway default must trust X-Real-IP");
assert.equal(clientNetworkIdentity(req({ "x-real-ip": "203.0.113.7" }), railway), "203.0.113.7");
assert.equal(
  clientNetworkIdentity(req({ "x-real-ip": "203.0.113.7", "cf-connecting-ip": "198.51.100.1" }), railway),
  "203.0.113.7",
  "a spoofed CF-Connecting-IP must not override the edge-set X-Real-IP",
);
const rotated = new Set(["1.1.1.1", "2.2.2.2", "3.3.3.3"].map((ip) =>
  clientNetworkIdentity(req({ "x-real-ip": "203.0.113.7", "cf-connecting-ip": ip, "x-forwarded-for": ip }), railway)));
assert.equal(rotated.size, 1, "rotating client-controlled headers must not create fresh rate-limit buckets");
assert.equal(clientNetworkIdentity(req({ "cf-connecting-ip": "198.51.100.1" }), railway), "unavailable",
  "without the trusted header, fall back to one shared bucket rather than trusting a client header");
assert.equal(trustedClientIpHeader({ TRUSTED_CLIENT_IP_HEADER: "Cf-Connecting-IP" }), "cf-connecting-ip", "operators may opt in to Cloudflare");
assert.equal(trustedClientIpHeader({ TRUSTED_CLIENT_IP_HEADER: "x-evil" }), "x-real-ip", "unknown header names must be ignored");
assert.equal(
  clientNetworkIdentity(req({ "x-forwarded-for": "6.6.6.6, 203.0.113.7" }), { TRUSTED_CLIENT_IP_HEADER: "x-forwarded-for" }),
  "203.0.113.7",
  "with X-Forwarded-For, only the proxy-appended right-most entry is trusted",
);

// ---- Admin allow-list: requires a verified email ----
const admin = readFileSync("lib/testerAdmin.ts", "utf8");
const fn = admin.match(/export function isVerifiedAllowListedAdmin\([\s\S]*?\n}\n/)?.[0];
assert.ok(fn, "isVerifiedAllowListedAdmin must exist");
// Evaluate the pure helper on its own (the module imports Next.js server APIs).
const js = fn.replace(/^export /, "")
  .replace(/user: \{[^}]*\} \| null,/, "user,")
  .replace(/allowList: string\[\],?/, "allowList")
  .replace(/\)\s*\{/, ") {");
const isVerifiedAllowListedAdmin = new Function(`${js}; return isVerifiedAllowListedAdmin;`)();
const list = ["owner@post2drive.test"];
assert.equal(isVerifiedAllowListedAdmin({ email: "owner@post2drive.test", emailVerifiedAt: new Date() }, list), true);
assert.equal(isVerifiedAllowListedAdmin({ email: "Owner@Post2Drive.test", emailVerifiedAt: new Date() }, list), true, "case-insensitive match");
assert.equal(isVerifiedAllowListedAdmin({ email: "owner@post2drive.test", emailVerifiedAt: null }, list), false,
  "an unverified copy of an admin's email must not grant admin");
assert.equal(isVerifiedAllowListedAdmin({ email: "someone@else.test", emailVerifiedAt: new Date() }, list), false);
assert.equal(isVerifiedAllowListedAdmin(null, list), false);
assert.match(admin, /prisma\.user\.findUnique\(\{ where: \{ id: userId \}, select: \{ email: true, emailVerifiedAt: true \} \}\)/,
  "isTesterAdmin must read the verified state from the database, not the session token");
assert.doesNotMatch(admin, /session\?\.user\?\.email[\s\S]{0,200}allowedEmails\.includes/, "the old unverified session-email check must not return");

console.log("Admin and rate-limit security contract passed: verified-email admin allow-list, edge-trusted client IP only.");
