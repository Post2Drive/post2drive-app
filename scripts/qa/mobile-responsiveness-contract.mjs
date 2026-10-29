import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const css = readFileSync("app/globals.css", "utf8") + "\n" + readFileSync("app/mobile-fit.css", "utf8");
const nav = readFileSync("app/main-nav.tsx", "utf8");
const marketplace = readFileSync("app/jobs/page.tsx", "utf8");
const createJob = readFileSync("app/jobs/new/page.tsx", "utf8");
const dashboard = readFileSync("app/dashboard/page.tsx", "utf8");
const payments = readFileSync("app/payments/page.tsx", "utf8");
const settings = readFileSync("app/settings/page.tsx", "utf8");
const vehicles = readFileSync("app/vehicles/page.tsx", "utf8");
const signup = readFileSync("app/signup/page.tsx", "utf8");
const login = readFileSync("app/login/page.tsx", "utf8");
const editJob = readFileSync("app/jobs/[id]/edit/page.tsx", "utf8");
const profile = readFileSync("app/profile/[id]/page.tsx", "utf8");

for (const breakpoint of ["@media (max-width: 900px)", "@media (max-width: 760px)", "@media (max-width: 560px)"]) {
  assert.ok(css.includes(breakpoint), `Missing responsive breakpoint: ${breakpoint}`);
}
assert.ok(css.includes(".desktop-nav") && css.includes("display: none !important"), "Desktop navigation must collapse before common mobile/tablet widths");
assert.ok(css.includes("overflow-x: auto") && css.includes(".mobile-bottom-nav"), "Mobile navigation must be horizontally scrollable when all routes do not fit");
assert.ok(css.includes("min-height: 48px !important"), "Mobile navigation links must provide 48px touch targets");
assert.ok(css.includes("min-height: 44px;") && css.includes("touch-action: manipulation"), "Controls must use touch-friendly target sizing");
assert.ok(css.includes("env(safe-area-inset-bottom)") && css.includes("env(safe-area-inset-left)"), "Mobile layout must respect device safe areas");
assert.ok(readFileSync("app/layout.tsx", "utf8").includes('viewportFit: "cover"'), "Viewport metadata must expose safe-area insets on notched devices");
assert.ok(css.includes("@media (hover: none) and (pointer: coarse)") && css.includes("scale(0.98)"), "Touch interactions must have restrained press feedback without sticky hover");
assert.ok(css.includes("@media (prefers-reduced-motion: reduce)") && css.includes("transition: none !important"), "Touch feedback must respect reduced-motion preference");
assert.ok(css.includes("-webkit-text-size-adjust: 100%") && css.includes("font-size: 16px"), "Mobile form text must avoid iOS focus zoom and preserve legibility");
assert.ok(css.includes("overflow-wrap: anywhere") && css.includes("max-width: 100%"), "Long content and media must not widen narrow viewports");
assert.ok(css.includes("main table") && css.includes("overflow-x: auto"), "Wide tables must scroll within the viewport rather than widen the page");
assert.ok(css.includes('[style*="minmax(280px"]') && css.includes("grid-template-columns: minmax(0, 1fr) !important"), "Wide inline grids must collapse to one column on phones");
assert.ok(css.includes(".ops-theme-dashboard .dashboard-stat-link") && css.includes("min-width: 0 !important"), "Dashboard KPI cards must not enforce widths that overflow narrow screens");
assert.ok(css.includes("nav[aria-label=\"Job posting progress\"]") && css.includes("repeat(2, minmax(0, 1fr))"), "Job-posting progress must reflow on narrow phones");

assert.ok(nav.includes('className="mobile-bottom-nav"') && nav.includes('aria-label="Mobile navigation"'), "Mobile navigation must remain present and labelled");
assert.ok(nav.includes('aria-current={active ? "page" : undefined}'), "Navigation must expose the active route accessibly");
assert.ok(marketplace.includes('className="marketplace-page"') && marketplace.includes('className="marketplace-job-tabs"'), "Marketplace must use width-safe layout and scrollable job tabs");
assert.ok(createJob.includes('aria-label="Job posting progress"'), "Job creation progress must remain labelled");
assert.ok(dashboard.includes('className="ops-theme-dashboard"'), "Dashboard must retain the responsive dashboard wrapper");
assert.ok(payments.includes("const pageStyle") && payments.includes("const summaryGrid"), "Payment cards must retain bounded responsive layout");
assert.ok(settings.includes('className="account-settings-page"'), "Account settings must use the responsive wrapper");
assert.ok(vehicles.includes("<main style={{ maxWidth: 760"), "Vehicle form must remain within a bounded responsive main column");
assert.ok(signup.includes("signup-review-grid") && signup.includes("signup-actions"), "Signup review and action areas must remain responsive");
assert.ok(login.includes('className="auth-page"'), "Login must use responsive auth layout");
assert.ok(editJob.includes("repeat(auto-fit, minmax(280px, 1fr))"), "Edit job form's wide fields must be handled by the mobile grid guard");
assert.ok(profile.includes('className="profile-page"'), "Public profile must use the responsive wrapper");

console.log("PASS mobile responsiveness contract: navigation, overflow containment, tap targets, dashboard, forms and primary routes.");
