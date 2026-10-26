import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const page = read("../../app/reset-password/page.tsx");
const config = read("../../next.config.js");

assert.ok(page.includes('url.searchParams.delete("token")'), "reset token must be removed from the URL query after capture");
assert.ok(page.includes('window.history.replaceState(window.history.state, "", cleanUrl)'), "reset token must be removed from browser history without navigation");
assert.ok(config.includes('source: "/reset-password"'), "reset page must have route-specific security headers");
assert.ok(config.includes('{ key: "Referrer-Policy", value: "no-referrer" }'), "reset token must not be sent in Referer headers");
assert.ok(config.includes('{ key: "Cache-Control", value: "no-store, max-age=0" }'), "reset page must not be cached");
console.log("Password reset URL-hygiene contract passed.");
