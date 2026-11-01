#!/usr/bin/env node
// Issue #38: CI supply-chain and target-validation hardening.
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { APPROVED_STAGING_ORIGINS } from "../../lib/qaRunnerGuard.ts";

const dir = ".github/workflows";
const workflows = Object.fromEntries(readdirSync(dir).filter((f) => f.endsWith(".yml")).map((f) => [f, readFileSync(`${dir}/${f}`, "utf8")]));

// 1. Every third-party action is pinned to an immutable commit SHA.
for (const [file, source] of Object.entries(workflows)) {
  for (const line of source.split("\n").filter((l) => /^\s*-?\s*uses:\s/.test(l))) {
    assert.match(line, /uses:\s*[\w.-]+\/[\w./-]+@[0-9a-f]{40}\s+#\s*v\d/, `${file}: action must be pinned to a full commit SHA with a version comment: ${line.trim()}`);
  }
}

// 2. The required Android check runs on every push to main.
assert.match(workflows["android-build.yml"], /push:\s*\n(?:\s*#.*\n)*\s*branches:\s*\[main,/, "android-build must run on pushes to main");

// 3. The tester-APK target must be an exact approved origin. Run the real validator.
const snippet = workflows["android-apk.yml"].match(/node -e '([\s\S]*?)'\s*\n/)?.[1];
assert.ok(snippet, "APK workflow validator not found");
assert.ok(APPROVED_STAGING_ORIGINS.every((origin) => snippet.includes(`"${origin}"`)), "APK allow-list must match APPROVED_STAGING_ORIGINS");
const accepts = (url) => {
  try { execFileSync(process.execPath, ["-e", snippet], { env: { ...process.env, CAPACITOR_SERVER_URL: url }, stdio: "pipe" }); return true; } catch { return false; }
};
assert.equal(accepts("https://post2drive-web-staging.up.railway.app"), true);
assert.equal(accepts("https://post2drive-web-staging.up.railway.app/"), true);
for (const bad of [
  "https://attacker-staging.example.com",
  "https://post2drive-web-staging.up.railway.app.attacker.example",
  "https://evil@post2drive-web-staging.up.railway.app",
  "https://post2drive-web-staging.up.railway.app:8443",
  "https://post2drive-web-staging.up.railway.app/path",
  "http://post2drive-web-staging.up.railway.app",
  "not a url",
]) assert.equal(accepts(bad), false, `APK target must be rejected: ${bad}`);

console.log("Workflow hardening contract passed: actions SHA-pinned, Android check on main, exact APK target allow-list.");
