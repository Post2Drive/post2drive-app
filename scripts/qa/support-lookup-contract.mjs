// Admin support lookup: admin only, view only, audited, and never selects secrets.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
const route = read("app/api/admin/support/account/route.ts");
const page = read("app/admin/support/page.tsx");

assert.match(route, /isTesterAdmin\(\)/, "support lookup must require admin authorization");
assert.match(route, /status: session \? 403 : 401/, "support lookup must refuse non-admins");
assert.match(route, /enforceRateLimit\(/, "support lookup must be rate limited");
assert.match(route, /export const GET\b/, "GET only");
assert.doesNotMatch(route, /export const (POST|PUT|PATCH|DELETE)\b/, "support lookup is view only");
assert.match(route, /adminAuditEvent\.create/, "every lookup must be audited");
assert.match(route, /SUPPORT_ACCOUNT_LOOKUP/);
assert.doesNotMatch(route, /details: \{[^}]*query[^}]*\}/, "audit details must not store the search text");
for (const secret of ["passwordHash", "sessionVersion", "resetTokens", "emailVerificationTokens", "licenceHash", "otp", "token"]) {
  assert.ok(!new RegExp(`${secret}\\s*:\\s*true`, "i").test(route), `support lookup must not select ${secret}`);
}
assert.match(route, /private, no-store/, "responses must not be cached");
assert.doesNotMatch(page, /method: "(POST|PUT|PATCH|DELETE)"/, "support page must not change data");
assert.match(page, /role=\{message\.error \? "alert" : "status"\}/, "status messages must be announced");
assert.match(page, /htmlFor="support-query"/, "search field must have a label");
const css = read("app/globals.css");
for (const name of new Set([...page.matchAll(/support-[a-z-]+/g)].map((m) => m[0]).filter((n) => n !== "support-query"))) {
  assert.ok(css.includes(`.${name}`) || /^support-\$/.test(name), `class .${name} needs a CSS rule`);
}
console.log("Support lookup contract passed: admin only, view only, audited, no secrets selected.");
