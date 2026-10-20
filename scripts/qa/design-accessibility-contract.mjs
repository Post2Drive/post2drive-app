import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL("../../" + path, import.meta.url), "utf8");
const css = read("app/globals.css");

function luminance(hex) {
  const rgb = hex.replace("#", "").match(/.{2}/g).map((part) => parseInt(part, 16) / 255);
  const linear = rgb.map((value) => value <= 0.04045 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4);
  return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
}

function contrast(a, b) {
  const values = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (values[0] + 0.05) / (values[1] + 0.05);
}

function token(name) {
  const match = css.match(new RegExp("--" + name + ":\\s*(#[0-9A-Fa-f]{6})\\s*;"));
  assert.ok(match, "Missing hex color token --" + name);
  return match[1];
}

const lightSurfaces = ["#FFFFFF", token("color-background")];
for (const name of ["color-text", "color-muted", "color-primary-action", "color-primary-action-hover", "color-positive", "color-warning", "color-danger"]) {
  for (const surface of lightSurfaces) {
    const ratio = contrast(token(name), surface);
    assert.ok(ratio >= 4.5, "--" + name + " contrast " + ratio.toFixed(2) + ":1 against " + surface + " is below WCAG AA 4.5:1");
  }
}

assert.match(css, /:where\(a, button, input, select, textarea, summary, \[tabindex\]\):focus-visible[\s\S]*?outline: 3px solid var\(--color-primary-action\)/, "Global keyboard focus must use a solid high-contrast indicator");
assert.match(css, /prefers-reduced-motion:\s*reduce/, "Global reduced-motion support is required");
assert.match(css, /\.skip-link:focus-visible[\s\S]*?transform: translateY\(0\)/, "Skip link must become visible on keyboard focus");
assert.match(css, /main input,\s*main select,\s*main textarea\s*\{\s*min-height:\s*44px;/, "Form controls must meet the 44px minimum target height");
assert.match(css, /main button \{\s*min-height: 44px;/, "Buttons must meet the 44px minimum target height");

const layout = read("app/layout.tsx");
assert.match(layout, /href="#main-content">Skip to main content/, "Layout must provide a skip-navigation link");
assert.match(layout, /id="main-content" tabIndex=\{-1\}/, "Skip link target must be programmatically focusable");

const nav = read("app/main-nav.tsx");
assert.match(nav, /aria-current=\{active \? "page" : undefined\}/, "Navigation must expose the current page");
assert.match(nav, /aria-expanded=\{moreOpen\}/, "More disclosure must expose expanded state");
assert.match(nav, /aria-controls="mobile-more-menu"/, "More disclosure must identify its controlled content");
assert.match(nav, /id="mobile-more-menu"[^>]*hidden=\{!moreOpen\}/, "More disclosure target must exist while collapsed and be hidden");
assert.match(css, /\.mobile-more-menu\[hidden\]\s*\{\s*display: none;/, "Collapsed More menu must not remain visible");

const jobs = read("app/jobs/page.tsx");
assert.match(jobs, /aria-pressed=\{tab === t\.key\}/, "Job filters must expose their selected state");
assert.match(jobs, /aria-label="Filter jobs by status"/, "Job filters must have an accessible group name");
assert.match(jobs, /role="status" aria-live="polite">Loading jobs/, "Marketplace loading state must be announced");
assert.match(jobs, /role="status">No jobs in this category/, "Marketplace empty state must be exposed as status");

const signup = read("app/signup/page.tsx");
assert.match(signup, /role="progressbar"/, "Signup progress must expose progressbar semantics");
assert.match(signup, /aria-valuenow=\{step \+ 1\}/, "Signup progress must expose the current step");
assert.match(signup, /role="alert"/, "Signup errors must be announced");
assert.match(signup, /role="status" aria-live="polite">\{resendMessage\}/, "Signup verification feedback must be announced");

const payments = read("app/payments/page.tsx");
assert.match(payments, /role="status" aria-live="polite"/, "Payment success/loading feedback must be announced");
assert.match(payments, /role="alert"/, "Payment errors must be announced");

const settings = read("app/settings/page.tsx");
assert.match(settings, /Could not load account settings\. Try again\./, "Account settings loading must have a recoverable error");
assert.match(settings, /role="alert">\{saveError\}/, "Account save errors must be announced");
assert.match(settings, /role="alert">\{pwError\}/, "Password update errors must be announced");
assert.match(settings, /disabled=\{saving\}/, "Duplicate account-save submissions must be prevented while saving");

const login = read("app/login/page.tsx");
assert.match(login, /autoComplete="email"/, "Login email must support autofill");
assert.match(login, /autoComplete="current-password"/, "Login password must support password managers");

console.log("Design accessibility source contracts passed (contrast, focus, motion, navigation, filters, signup, payments, and login).");
