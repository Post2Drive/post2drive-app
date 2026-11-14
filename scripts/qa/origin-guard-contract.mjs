#!/usr/bin/env node
// Cross-site write guard (CSRF defence in depth) and response-header policy. Hermetic.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { isCrossSiteWrite } from "../../lib/originGuard.ts";

const hosts = ["app.example.com", "app.example.com", "https://app.example.com", undefined];
const check = (over) => isCrossSiteWrite({ method: "POST", pathname: "/api/jobs", origin: "https://app.example.com", secFetchSite: "same-origin", allowedHosts: hosts, ...over });
let n = 0; const eq = (a, b, m) => { assert.equal(a, b, m); n += 1; };

eq(check({}), false, "same-origin write is allowed");
eq(check({ origin: "https://evil.example" }), true, "another site's write is refused");
eq(check({ origin: "https://app.example.com.evil.example" }), true, "look-alike host is refused");
eq(check({ origin: "http://app.example.com:8080" }), true, "a different port is a different origin");
eq(check({ origin: "null" }), true, "an opaque 'null' origin is refused");
eq(check({ origin: "https://APP.example.com" }), false, "host comparison ignores case");
eq(check({ origin: null, secFetchSite: null }), false, "server-to-server calls (no Origin) reach the route's own auth");
eq(check({ origin: null, secFetchSite: "cross-site" }), true, "a browser-declared cross-site write is refused even without Origin");
eq(check({ origin: "https://evil.example", method: "GET" }), false, "reads are not blocked here");
eq(check({ origin: "https://evil.example", method: "delete" }), true, "method match ignores case");
eq(check({ origin: "https://evil.example", pathname: "/jobs" }), false, "only API routes are guarded");
for (const path of ["/api/subscription/webhook", "/api/subscription/webhook/stripe", "/api/verification/start/webhook", "/api/internal/notifications/run", "/api/security/csp-report"]) {
  eq(check({ origin: "https://hooks.stripe.com", pathname: path }), false, `${path} is authenticated by signature/secret, not Origin`);
}
eq(check({ origin: "https://evil.example", pathname: "/api/subscription/webhookx" }), true, "exemption is by path segment, not by prefix text");
eq(check({ origin: "https://evil.example", pathname: "/api/subscription/create-payment" }), true, "starting a payment cannot be triggered from another site");
eq(check({ origin: "https://evil.example", pathname: "/api/auth/callback/credentials" }), true, "login cannot be driven from another site");
eq(isCrossSiteWrite({ method: "POST", pathname: "/api/jobs", origin: "https://app.example.com", secFetchSite: null, allowedHosts: [null, undefined, ""] }), true, "fails closed when the deployment's own host is unknown");

const proxy = readFileSync("proxy.ts", "utf8");
assert.match(proxy, /export function proxy\(/); n += 1;
assert.match(proxy, /matcher: "\/api\/:path\*"/); n += 1;
assert.match(proxy, /status: 403/); n += 1;
assert.match(proxy, /x-forwarded-host/, "must honour the platform's forwarded host"); n += 1;

const config = readFileSync("next.config.js", "utf8");
assert.match(config, /"script-src 'self' 'unsafe-inline'"/, "no wildcard script hosts"); n += 1;
assert.doesNotMatch(config, /script-src[^\n"]*https:/, "script-src must not allow every https host"); n += 1;
assert.doesNotMatch(config, /script-src[^\n"]*unsafe-eval/); n += 1;
assert.match(config, /"form-action 'self'"/, "forms may only post to this site"); n += 1;
assert.match(config, /frame-ancestors 'none'/); n += 1;
assert.match(config, /Cross-Origin-Opener-Policy/); n += 1;
assert.match(config, /Strict-Transport-Security/); n += 1;
console.log(`Origin guard and header contract passed: ${n} checks.`);
