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

const dashboard = read("app/dashboard/page.tsx");
assert.match(dashboard, /export default async function DashboardPage\([\s\S]*?return \([\s\S]*?<main/, "Dashboard must expose a main landmark");

const jobs = read("app/jobs/page.tsx");
assert.match(jobs, /aria-pressed=\{tab === t\.key\}/, "Job filters must expose their selected state");
assert.match(jobs, /aria-label="Filter jobs by status"/, "Job filters must have an accessible group name");
assert.match(jobs, /role="status" aria-live="polite">Loading jobs/, "Marketplace loading state must be announced");
assert.match(jobs, /role="status">No jobs in this category/, "Marketplace empty state must be exposed as status");
assert.match(jobs, /setLoadError\(data\.error \|\| "Could not load jobs\. Try again\."\)/, "Marketplace load failures must have distinct recoverable error state");
assert.match(jobs, /role="alert" aria-live="assertive"/, "Marketplace load errors must be announced assertively");
assert.match(jobs, /Retry loading jobs/, "Marketplace load failures must offer retry");
assert.match(jobs, /!loading && !loadError/, "Marketplace error state must not be misreported as an empty result");

const signup = read("app/signup/page.tsx");
assert.match(signup, /role="progressbar"/, "Signup progress must expose progressbar semantics");
assert.match(signup, /aria-valuenow=\{step \+ 1\}/, "Signup progress must expose the current step");
assert.match(signup, /role="alert"/, "Signup errors must be announced");
assert.match(signup, /role="status" aria-live="polite">\{resendMessage\}/, "Signup verification feedback must be announced");
assert.match(signup, /stepHeadingRef\.current\?\.focus\(\)/, "Signup must move focus to the new step heading");
assert.match(signup, /<h2 ref=\{stepHeadingRef\} tabIndex=\{-1\}/, "Signup step heading must be focusable");

const payments = read("app/payments/page.tsx");
assert.match(payments, /role="status" aria-live="polite"/, "Payment success/loading feedback must be announced");
assert.match(payments, /role="alert"/, "Payment errors must be announced");
assert.match(payments, /Retry loading payments/, "Payment load failures must offer a retry action");
assert.match(payments, /if \(loading && !data\)/, "Payment refreshes must not discard already loaded context");
assert.match(payments, /Refreshing payment information…/, "Payment refresh progress must be announced while existing content remains visible");
assert.match(payments, /aria-label=\{\`Mark payment as paid for \$\{job.pickup\} to \$\{job.dropoff\}\`\}/, "Repeated payment actions must identify their job route");
assert.match(payments, /aria-label=\{\`Confirm payment receipt for \$\{job.pickup\} to \$\{job.dropoff\}\`\}/, "Repeated receipt actions must identify their job route");
assert.match(payments, /background: "var\(--color-surface\)"/, "Payment cards must use shared surface tokens");
assert.match(payments, /color: "var\(--color-muted\)"/, "Payment summary text must use the shared readable muted-text token");
assert.match(payments, /function Empty\(\{ text \}: \{ text: string \}\)[\s\S]*?role="status"[\s\S]*?color: "var\(--color-muted\)"/, "Payment empty states must be announced with readable muted text");

const vehicles = read("app/vehicles/page.tsx");
assert.match(vehicles, /role="status">No vehicles registered yet\./, "Vehicle empty state must be announced as status");
assert.match(vehicles, /Retry loading vehicles/, "Vehicle loading failures must offer recovery");
assert.match(vehicles, /minHeight: 44/, "Vehicle submit button must meet the minimum target height");
assert.match(vehicles, /aria-labelledby="vehicle-registration-heading"/, "Vehicle form must have a programmatic name");
assert.match(vehicles, /id="vehicle-registration-heading"/, "Vehicle registration form must have a visible heading");
assert.match(vehicles, /role="region" aria-label="Registered vehicles"/, "Registered vehicles must have a named region");
assert.match(vehicles, /timeZone: "UTC"/, "Date-only vehicle expiry values must not shift across viewer time zones");

const requirements = read("app/requirements/page.tsx");
assert.match(requirements, /role="region" aria-label="Posted requirements"/, "Posted requirements must have a named region");
assert.match(requirements, /aria-label=\{\`Edit requirement: \$\{routeLabel\}\`\}/, "Repeated edit links must identify their route");
assert.match(requirements, /aria-label=\{\`View \$\{routeLabel\} in marketplace\`\}/, "Repeated marketplace links must identify their route");
assert.match(requirements, /aria-label=\{\`View incident history for \$\{routeLabel\}\`\}/, "Repeated incident links must identify their route");

const jobCreate = read("app/jobs/new/page.tsx");
assert.match(jobCreate, /stepHeadingRef\.current\?\.focus\(\)/, "Job wizard must move focus to each new step");
assert.match(jobCreate, /<h2 ref=\{stepHeadingRef\} tabIndex=\{-1\}/, "Job wizard headings must be focusable for step transitions");

const settings = read("app/settings/page.tsx");
assert.match(settings, /Could not load account settings\. Try again\./, "Account settings loading must have a recoverable error");
assert.match(settings, /role="alert">\{saveError\}/, "Account save errors must be announced");
assert.match(settings, /role="alert">\{pwError\}/, "Password update errors must be announced");
assert.match(settings, /disabled=\{saving\}/, "Duplicate account-save submissions must be prevented while saving");
assert.match(settings, /<h2>Profile<\/h2>/, "Account settings sections must follow a logical heading hierarchy");
assert.match(settings, /<h2 style=\{\{ marginTop: 32 \}\}>Change password<\/h2>/, "Password settings must use a second-level heading");
assert.match(settings, /aria-labelledby="delete-account-heading"/, "Destructive account section must have a programmatic name");
assert.match(settings, /autoComplete="off" autoCapitalize="characters" spellCheck=\{false\}/, "Typed deletion confirmation must not be silently transformed by browser helpers");

const research = read("app/admin/research/page.tsx");
assert.match(research, /if \(!\(await isTesterAdmin\(\)\)\) redirect/, "India research dashboard must be administrator-only");
assert.match(research, /deletionRequestedAt: null/, "Research aggregates must exclude accounts marked for deletion");
assert.match(research, /select: \{ marketResearch: true \}/, "Research dashboard must not fetch account identifiers");
assert.match(research, /No optional market-research responses yet/, "Research dashboard must communicate its empty state");

const profileApi = read("app/api/profile/[id]/route.ts");
assert.match(profileApi, /getServerSession\(authOptions\)/, "Public profile API must require an authenticated session");
assert.match(profileApi, /target\.country !== viewer\.country \|\| target\.currency !== viewer\.currency/, "Public profile API must enforce same-market access");
assert.match(profileApi, /deletionRequestedAt: null/, "Deleted accounts must not be exposed through profile lookup");
assert.doesNotMatch(profileApi, /passwordHash|marketResearch|email: true|phone: true|insuranceDocumentUrl|v5cDocumentUrl/, "Profile API must not select private account, contact or vehicle-document data");

const login = read("app/login/page.tsx");
assert.match(login, /autoComplete="email"/, "Login email must support autofill");
assert.match(login, /autoComplete="current-password"/, "Login password must support password managers");

console.log("Design accessibility source contracts passed (contrast, focus, motion, navigation, forms, requirements, signup, payments, vehicles, settings, admin research privacy, and login).");
