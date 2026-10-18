import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

function luminance(hex) {
  const raw = hex.replace("#", "");
  const full = raw.length === 3 ? [...raw].map((part) => part + part).join("") : raw;
  const rgb = [0, 2, 4].map((offset) => parseInt(full.slice(offset, offset + 2), 16) / 255);
  const linear = rgb.map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return linear.reduce((sum, value, index) => sum + value * [0.2126, 0.7152, 0.0722][index], 0);
}

function contrast(foreground, background) {
  const a = luminance(foreground);
  const b = luminance(background);
  return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
}

function expectTextContrast(name, foreground, background, minimum = 4.5) {
  const ratio = contrast(foreground, background);
  assert.ok(ratio >= minimum, `${name}: ${foreground} on ${background} is ${ratio.toFixed(2)}:1; expected at least ${minimum}:1`);
  console.log(`PASS ${name}: ${ratio.toFixed(2)}:1`);
}

const css = readFileSync("app/globals.css", "utf8");
const ops = readFileSync("ops-dashboard/server.mjs", "utf8");
const checks = [
  ["app/jobs/page.tsx", /status === "completed"/],
  ["app/requirements/page.tsx", /job\.status/],
  ["app/payments/page.tsx", /const pendingBadge/],
  ["app/jobs/[id]/edit/page.tsx", /Save changes/],
  ["app/settings/page.tsx", /Permanently anonymise account/],
  ["app/vehicles/page.tsx", /Vehicles/],
  ["components/subscription-status.tsx", /statusTextColor/],
];
for (const [path] of checks) {
  const content = readFileSync(path, "utf8");
  assert.ok(content.length > 0, `Missing contrast-audit target: ${path}`);
  assert.ok(!content.includes('color: "#081323"'), `${path} still uses low-contrast navy text on the blue primary action`);
  assert.ok(!content.includes('color: "#F2C300"'), `${path} uses yellow as small text on a light surface`);
  assert.ok(!content.includes('color: "#E87500"'), `${path} uses orange as small text on a light surface`);
  console.log(`PASS audited component ${path}`);
}

expectTextContrast("black text on white", "#171717", "#FFFFFF", 7);
expectTextContrast("primary blue button text", "#FFFFFF", "#2457D6");
expectTextContrast("error red on white", "#D62828", "#FFFFFF");
expectTextContrast("success green on white", "#18864B", "#FFFFFF");
expectTextContrast("purple on white", "#6D28D9", "#FFFFFF");
expectTextContrast("magenta on white", "#C0268D", "#FFFFFF");
expectTextContrast("black text on yellow", "#171717", "#F2C300", 7);
expectTextContrast("black text on orange", "#171717", "#E87500");
expectTextContrast("black text on cyan", "#171717", "#0096C7");

assert.ok(css.includes('[style*="color: var(--color-warning)"]'), "App CSS must correct inline yellow text");
assert.ok(css.includes('[style*="color: var(--ops-orange)"]'), "App CSS must correct inline orange text");
assert.ok(css.includes('[style*="color: var(--ops-cyan)"]'), "App CSS must correct inline cyan text");
assert.ok(css.includes('main table th,main th,th{background:#F2C300!important;color:#171717!important'), "Table headings must have black text on solid yellow");
assert.ok(css.includes('main [role="alert"],.auth-page [role="alert"],.signup-error{'), "Error messages need readable explicit styling");
assert.ok(css.includes('main .button-link-secondary,.auth-page .button-link-secondary'), "Secondary links must keep a white surface and contrasting text");

const dashboardStart = ops.indexOf("const dashboard = `");
const dashboardStyleEnd = ops.indexOf("</style>", dashboardStart);
const adminContrast = ops.indexOf("/* Contrast audit: labels and controls must never inherit the same colour as their surface. */", dashboardStart);
assert.ok(dashboardStart >= 0 && dashboardStyleEnd > dashboardStart, "Could not locate operations dashboard stylesheet");
assert.ok(adminContrast > dashboardStart && adminContrast < dashboardStyleEnd, "Admin contrast overrides must be inside the dashboard stylesheet");
assert.ok(ops.includes('.header-signout button{\n background:#FFFFFF!important;color:#2457D6!important'), "Admin sign-out must be readable on white");
assert.ok(ops.includes('.filter-drawer>summary,.filter-drawer>summary:after{\n background:#FFFFFF!important;color:#171717!important'), "Admin filter control must be readable on white");
assert.ok(ops.includes('.pill.warn{color:#171717!important;border-color:#F2C300!important}'), "Admin warning pills must use black text");

console.log("PASS Post2Drive contrast guardrails: text, buttons, tables, alerts, charts and admin controls.");

expectTextContrast("disabled button text", "#30343B", "#E8EBF0");
assert.ok(css.includes("a.button-link-secondary,") && css.includes(".button-link-secondary *"), "Secondary links must stay white with blue text on every route wrapper");
assert.ok(css.includes("a.button-link:not(.button-link-secondary)") && css.includes("color: #FFFFFF !important;"), "Primary action links must force white text on blue");
assert.ok(css.includes("button:disabled,") && css.includes('input[type="submit"]:disabled,') && css.includes('input[type="button"]:disabled'), "Disabled button contrast must not inherit pale text on a saturated background");
console.log("PASS screenshot-driven global button and link contrast rules.");

const settingsPage = readFileSync("app/settings/page.tsx", "utf8");
const marketplacePage = readFileSync("app/jobs/page.tsx", "utf8");
assert.ok(settingsPage.includes('className="account-settings-page"'), "Account settings must use the shared layout wrapper");
assert.ok(marketplacePage.includes('className="marketplace-page"'), "Marketplace must use a responsive width-safe wrapper");
assert.ok(css.includes(".account-settings-page label input:not([type=\"checkbox\"])"), "Account settings fields must have their own legible stacked layout");
assert.ok(css.includes(".marketplace-header-actions"), "Marketplace header actions must wrap rather than push the title off-screen");
console.log("PASS responsive wrappers and account form layout.");
