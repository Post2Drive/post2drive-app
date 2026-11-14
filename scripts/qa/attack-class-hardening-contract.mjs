// Regression guards for the attack classes reviewed on 2026-11-14:
// one-time-code brute force and replay under concurrency, look-alike
// identities, oversized login input, weak randomness and unsafe parsers.
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { InMemoryOtpStore, issueOtp, verifyOtp, OTP_MAX_ATTEMPTS, OTP_RESEND_COOLDOWN_MS } from "../../lib/providerLifecycle.ts";
import { normalizeEmail, normalizeDisplayText } from "../../lib/identityText.ts";

let checks = 0;
const ok = (condition, message) => { assert.ok(condition, message); checks++; };
const eq = (actual, expected, message) => { assert.deepEqual(actual, expected, message); checks++; };
const read = (path) => readFileSync(path, "utf8");

// --- One-time codes: parallel guesses and replay -------------------------
const now = 1_800_000_000_000;
const pepper = "test-only-pepper";
const later = now + OTP_RESEND_COOLDOWN_MS;

/** Store whose reads are all served before any write lands, like parallel requests. */
class SlowStore extends InMemoryOtpStore {
  async get(phoneHash) { const snapshot = await super.get(phoneHash); await new Promise((r) => setTimeout(r, 5)); return snapshot; }
}
const racing = new SlowStore();
await issueOtp("+919800000001", racing, { now, pepper, providerConfigured: true, generateCode: () => "424242" });
const wrong = Array.from({ length: 20 }, (_, i) => String(100000 + i));
const results = await Promise.all(wrong.map((code) => verifyOtp("+919800000001", code, racing, { now: later, pepper })));
ok(results.every((r) => r === false), "wrong guesses never verify");
eq(await verifyOtp("+919800000001", "424242", racing, { now: later, pepper }), false,
  "parallel wrong guesses must each count, locking the code after the limit");

const replay = new SlowStore();
await issueOtp("+919800000002", replay, { now, pepper, providerConfigured: true, generateCode: () => "515151" });
const [good, bad] = await Promise.all([
  verifyOtp("+919800000002", "515151", replay, { now: later, pepper }),
  verifyOtp("+919800000002", "000000", replay, { now: later, pepper }),
]);
eq([good, bad], [true, false], "correct code verifies once alongside a wrong guess");
eq(await verifyOtp("+919800000002", "515151", replay, { now: later + 1, pepper }), false,
  "a late wrong guess must not make a used code usable again");

const lifecycle = read("lib/providerLifecycle.ts");
const verifyBody = lifecycle.slice(lifecycle.indexOf("export async function verifyOtp"), lifecycle.indexOf("/** Test-only memory store"));
ok(!verifyBody.includes("store.put("), "verifyOtp must not rewrite the whole challenge row");
ok(verifyBody.includes("store.recordFailure("), "verifyOtp counts failures through the atomic store call");
const otpStore = read("lib/otpStore.ts");
ok(/recordFailure[\s\S]*?updateMany[\s\S]*?attempts: \{ increment: 1 \}/.test(otpStore), "durable store increments attempts atomically");
ok(OTP_MAX_ATTEMPTS <= 5, "one-time code attempt limit stays small");

// --- Look-alike identities ----------------------------------------------
eq(normalizeEmail("  Owner@Example.COM "), "owner@example.com", "email is trimmed and lower-cased");
eq(normalizeEmail("ｏｗｎｅｒ@example.com"), "owner@example.com", "full-width letters fold to the same address");
eq(normalizeEmail("оwner@example.com"), null, "Cyrillic look-alike letters are refused");
eq(normalizeEmail("own​er@example.com"), null, "zero-width characters are refused");
eq(normalizeEmail("owner@exаmple.com"), null, "look-alike domains are refused");
eq(normalizeEmail("not-an-email"), null, "shape is still checked");
eq(normalizeEmail("a".repeat(250) + "@x.co"), null, "over-long addresses are refused");
eq(normalizeEmail(undefined), null, "non-strings are refused");
eq(normalizeDisplayText("  Ravi   Kumar "), "Ravi Kumar", "names are trimmed and single-spaced");
eq(normalizeDisplayText(""), "", "a name can still be cleared on purpose");
eq(normalizeDisplayText("రవి కుమార్"), "రవి కుమార్", "Telugu names are kept");
eq(normalizeDisplayText("क्‍ष"), "क्‍ष", "Indic joiner characters are kept");
eq(normalizeDisplayText("Post2Drive‮evirD"), null, "direction overrides are refused");
eq(normalizeDisplayText("Post2​Drive"), null, "zero-width spaces are refused");
eq(normalizeDisplayText("Admin\u0000"), null, "control characters are refused");

const signup = read("app/api/signup/route.ts");
ok(signup.includes("normalizeEmail(") && signup.includes("normalizeDisplayText("), "signup applies the identity rules");
ok(!/email\.trim\(\)\.toLowerCase\(\)/.test(signup), "signup has no second, weaker email normaliser");
const account = read("app/api/account/route.ts");
ok(account.includes("normalizeDisplayText("), "account updates apply the display-name rule");
ok(account.indexOf("normalizeDisplayText(name)") < account.indexOf("prisma.$transaction"), "name check runs before any write");

// --- Login and password bounds ------------------------------------------
const auth = read("lib/auth.ts");
ok(/credentials\.email\.length > 254 \|\| credentials\.password\.length > 1024/.test(auth), "login bounds identifier and password size");
ok(auth.indexOf("credentials.password.length > 1024") < auth.indexOf("bcrypt.compare"), "bound is applied before hashing");
for (const file of ["app/api/signup/route.ts", "app/api/auth/reset-password/route.ts", "app/api/phone-otp/reset/route.ts", "app/api/account/route.ts"]) {
  ok(/Buffer\.byteLength\((password|newPassword), "utf8"\) > 72/.test(read(file)), `${file} refuses passwords bcrypt would truncate`);
}

// --- Whole-tree guards ----------------------------------------------------
const SKIP = new Set(["node_modules", ".next", ".git", ".agents", "android", "qa", "public"]);
const sources = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    if (SKIP.has(name)) continue;
    const path = join(dir, name);
    if (statSync(path).isDirectory()) walk(path);
    else if (/\.(ts|tsx|mjs|js)$/.test(name)) sources.push(path);
  }
})(".");
ok(sources.length > 100, "source tree was scanned");

// Math.random may only pace sampling and retry jitter, never mint a secret.
const RANDOM_ALLOWED = new Set(["lib/apiMetrics.ts", "lib/rateLimit.ts", "lib/httpRetry.ts"]);
const randomUsers = sources.filter((path) => read(path).includes("Math.random")).map((p) => p.replace(/^\.\//, ""));
eq(randomUsers.filter((p) => !RANDOM_ALLOWED.has(p)), [], "Math.random is not used outside sampling and jitter");

const banned = [
  [/\beval\(|new Function\(/, "dynamic code execution"],
  [/from "(xml2js|fast-xml-parser|libxmljs2?|handlebars|ejs|pug|mustache|lodash|jsonwebtoken|ws|socket\.io)"/, "XML, template, deep-merge, hand-rolled token or socket library"],
  [/createCipheriv\(\s*["']aes-\d+-cbc/, "CBC-mode encryption"],
  [/__proto__/, "prototype access"],
];
for (const [pattern, label] of banned) {
  eq(sources.filter((path) => pattern.test(read(path))), [], `no ${label} in application code`);
}
const pkg = JSON.parse(read("package.json"));
const deps = Object.keys({ ...pkg.dependencies, ...pkg.devDependencies });
eq(deps.filter((d) => /^(xml2js|fast-xml-parser|handlebars|ejs|pug|lodash|jsonwebtoken|ws|socket\.io|graphql|passport-saml|@node-saml\/.*)$/.test(d)), [],
  "no XML, template, GraphQL, SAML, socket or hand-rolled token dependencies");

// Sign-in stays password or one-time code only: no third-party identity provider to spoof.
ok(!/next-auth\/providers\/(?!credentials)/.test(auth), "only credential sign-in providers are configured");

// Client address for rate limits comes from the trusted edge header only.
const clientIp = read("lib/clientIp.ts");
ok(clientIp.includes('"x-real-ip"') && /\.pop\(\)/.test(clientIp), "rate-limit identity ignores caller-supplied forwarded addresses");

console.log(`attack-class hardening contract passed (${checks} checks)`);
