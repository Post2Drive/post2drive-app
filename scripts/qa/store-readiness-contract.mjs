#!/usr/bin/env node
// App-store readiness: no secrets in the repo, safe Android packaging, a signed
// release path, and the account-deletion page both stores require. Hermetic.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

const read = (p) => readFileSync(p, "utf8");
let n = 0; const ok = (c, m) => { assert.ok(c, m); n += 1; };

// 1. No credential-shaped strings and no signing material in tracked files.
const tracked = execFileSync("git", ["ls-files"], { encoding: "utf8" }).split("\n").filter(Boolean);
const forbiddenFiles = tracked.filter((f) => /\.(jks|keystore|p12|pfx|pem|key)$/i.test(f) || /(^|\/)(google-services\.json|GoogleService-Info\.plist|keystore\.properties|local\.properties)$/.test(f) || (/(^|\/)\.env(\..+)?$/.test(f) && !/\.example$/.test(f)));
assert.deepEqual(forbiddenFiles, [], "signing keys, service files and .env files must never be committed"); n += 1;
const secretShapes = [
  /\b(sk|rk)_live_[A-Za-z0-9]{16,}/, /\bwhsec_[A-Za-z0-9+/=]{24,}/, /\bre_[A-Za-z0-9]{8,}_[A-Za-z0-9]{16,}/,
  /\bAKIA[0-9A-Z]{16}\b/, /\bAIza[0-9A-Za-z_-]{35}\b/, /\bgh[pousr]_[A-Za-z0-9]{36,}/, /\bxox[baprs]-[A-Za-z0-9-]{20,}/,
  /-----BEGIN (RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/, /\bAC[0-9a-f]{32}\b[\s\S]{0,40}[0-9a-f]{32}\b/,
];
const skip = /^(package-lock\.json|\.agents\/|scripts\/qa\/(store-readiness|provider-adapters)-contract\.mjs|android\/gradle\/wrapper\/|public\/|.*\.(png|jpg|jpeg|webp|ico|jar|svg))/;
const hits = [];
for (const file of tracked) {
  if (skip.test(file) || !existsSync(file)) continue;
  const text = read(file);
  for (const shape of secretShapes) if (shape.test(text)) hits.push(`${file}: ${shape}`);
}
assert.deepEqual(hits, [], "credential-shaped strings found in tracked files"); n += 1;
const ignore = read(".gitignore");
for (const pattern of [".env*", "*.jks", "*.keystore", "*.p12", "*.pem", "*.key", "keystore.properties", "/android/local.properties"]) {
  ok(ignore.includes(pattern), `.gitignore must cover ${pattern}`);
}

// 2. Android packaging.
const manifest = read("android/app/src/main/AndroidManifest.xml");
ok(/android:allowBackup="false"/.test(manifest), "app data (sign-in state) must not go to device backups");
ok(/android:dataExtractionRules="@xml\/data_extraction_rules"/.test(manifest) && existsSync("android/app/src/main/res/xml/data_extraction_rules.xml"), "Android 12+ backup/transfer rules must be declared");
ok(/android:usesCleartextTraffic="false"/.test(manifest), "plain-http traffic must be off");
ok(!/android:debuggable="true"/.test(manifest), "the manifest must not force debuggable");
const permissions = [...manifest.matchAll(/<uses-permission[^>]*android:name="([^"]+)"/g)].map((m) => m[1]);
assert.deepEqual(permissions, ["android.permission.INTERNET"], "only INTERNET is requested; any new permission needs a store data-safety review"); n += 1;
const exported = [...manifest.matchAll(/<(activity|provider|service|receiver)\b[^>]*>/g)].filter((m) => /android:exported="true"/.test(m[0])).map((m) => m[0].match(/android:name="([^"]+)"/)?.[1]);
assert.deepEqual(exported, [".MainActivity"], "only the launcher activity may be exported"); n += 1;

const gradle = read("android/app/build.gradle");
ok(/versionCode releaseVersionCode/.test(gradle) && /P2D_VERSION_CODE/.test(gradle), "the store version code is supplied per release, not hard-coded");
ok(/signingConfig signingConfigs\.release/.test(gradle) && /P2D_RELEASE_STORE_FILE/.test(gradle), "release signing is configured from the environment");
ok(!/storePassword\s+["'][^"']+["']/.test(gradle) && !/keyPassword\s+["'][^"']+["']/.test(gradle), "no signing password is written in the build file");
ok(/debuggable false/.test(gradle), "release builds are not debuggable");
const vars = read("android/variables.gradle");
ok(Number(vars.match(/targetSdkVersion = (\d+)/)?.[1]) >= 35, "target SDK must meet the current Google Play requirement (35+)");

const cap = read("capacitor.config.ts");
ok(/appId: 'com\.post2drive\.app'/.test(cap), "application id is stable (it can never change after first store upload)");
ok(/must use HTTPS except for localhost development/.test(cap), "the wrapper refuses a non-HTTPS server");
ok(!/allowNavigation/.test(cap), "no extra hosts may load inside the app WebView");
ok(!/webContentsDebuggingEnabled:\s*true/.test(cap), "WebView debugging must not be forced on");

// 3. Signed release workflow.
const release = read(".github/workflows/android-release.yml");
ok(/workflow_dispatch/.test(release) && !/^\s*(push|pull_request|schedule):/m.test(release), "releases are built only when a person starts one");
ok(/bundleRelease/.test(release) && /jarsigner -verify/.test(release), "the workflow builds an .aab and proves it is signed");
ok(/secrets\.ANDROID_KEYSTORE_BASE64/.test(release) && /rm -f "\$RUNNER_TEMP\/release\.jks"/.test(release), "the keystore comes from secrets and is removed afterwards");
ok(/permissions:\s*\n\s*contents: read/.test(release), "the release job has read-only repository access");
const validator = release.match(/node -e '([\s\S]*?)'\s*\n/)?.[1];
ok(Boolean(validator), "release input validator present");
const accepts = (url, code = "7", name = "1.0.0") => {
  try { execFileSync(process.execPath, ["-e", validator], { env: { ...process.env, CAPACITOR_SERVER_URL: url, P2D_VERSION_CODE: code, P2D_VERSION_NAME: name }, stdio: "pipe" }); return true; } catch { return false; }
};
ok(accepts("https://app.post2drive.com"), "a production https origin is accepted");
for (const bad of ["https://post2drive-web-staging.up.railway.app", "https://staging.post2drive.com", "https://anything.up.railway.app", "http://app.post2drive.com", "https://app.post2drive.com/path", "https://user@app.post2drive.com", "https://app.post2drive.com:8443", "not a url"]) {
  ok(!accepts(bad), `release must refuse ${bad}`);
}
ok(!accepts("https://app.post2drive.com", "0") && !accepts("https://app.post2drive.com", "1.5") && !accepts("https://app.post2drive.com", "7", "one"), "version inputs are validated");

// 4. Account deletion: reachable without signing in, linked from every page footer, and done in-app.
const deletion = read("app/account-deletion/page.tsx");
ok(/Delete your Post2Drive account/.test(deletion) && /What is deleted/.test(deletion) && /What is kept/.test(deletion), "the public page says how to delete, what goes and what stays");
ok(/href="\/account-deletion"/.test(read("components/legal-footer.tsx")), "the deletion page is linked from the footer");
ok(/\/account-deletion/.test(read("app/sitemap.ts")), "the deletion page is in the sitemap");
ok(/method: "DELETE"/.test(read("app/settings/page.tsx")), "deletion can be completed inside the app");

// 5. Website-only payments: nothing is sold, and nothing links to a checkout, inside the store app.
const { isStoreApp } = await import("../../lib/nativeApp.ts");
ok(isStoreApp({ Capacitor: { isNativePlatform: () => true } }) === true, "the Capacitor wrapper is recognised as the store app");
ok(isStoreApp({ Capacitor: { getPlatform: () => "android" } }) === true && isStoreApp({ Capacitor: { getPlatform: () => "ios" } }) === true, "Android and iOS shells are recognised");
ok(isStoreApp({}) === false && isStoreApp(null) === false && isStoreApp({ Capacitor: { isNativePlatform: () => false } }) === false && isStoreApp({ Capacitor: { getPlatform: () => "web" } }) === false, "an ordinary browser is not the store app");
ok(isStoreApp({ Capacitor: { isNativePlatform: () => { throw new Error("x"); } } }) === true, "an unreadable bridge hides Pay (safe side)");
const status = read("components/subscription-status.tsx");
ok(/const canPay = !inStoreApp &&/.test(status), "the Pay button is never rendered inside the store app");
ok(/if \(paying \|\| inStoreApp\) return;/.test(status), "checkout cannot be started inside the store app even if called directly");
const storeCopy = [...status.matchAll(/inStoreApp\s*\?\s*"([^"]+)"/g)].map((m) => m[1]);
ok(storeCopy.length >= 2, "the store app has its own plan wording");
for (const text of storeCopy) {
  ok(!/https?:|website|browser|post2drive\.com|checkout page|pay (at|on|online)|visit|go to/i.test(text), `store-app wording must not point to a place to pay: "${text}"`);
}

console.log(`Store readiness contract passed: ${n} checks.`);
