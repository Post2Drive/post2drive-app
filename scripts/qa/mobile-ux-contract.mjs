import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const nav = read("../../app/main-nav.tsx");
const css = read("../../app/globals.css");
const layout = read("../../app/layout.tsx");

assert.ok(nav.includes('case "/jobs": return "Jobs"'), "mobile marketplace label should fit narrow screens");
assert.ok(nav.includes('case "/jobs/new": return "Post"'), "mobile job-posting label should be compact");
assert.ok(nav.includes('aria-label={mobileLabel(link.href, link.label)}'), "accessible names must match visible compact labels");
assert.ok(nav.includes('aria-expanded={moreOpen}'), "More menu must expose expanded state");
assert.ok(css.includes("env(safe-area-inset-bottom)"), "mobile navigation must respect device safe areas");
assert.ok(css.includes(".mobile-nav-label"), "mobile labels must have a dedicated layout rule");
assert.ok(css.includes("overflow: visible !important"), "primary mobile navigation should not require horizontal scrolling");
assert.ok(css.includes("min-height: 48px !important"), "mobile navigation targets must be comfortably tappable");
assert.ok(css.includes("font-size: 16px !important"), "phone inputs should avoid iOS focus zoom");
assert.ok(css.includes("overscroll-behavior-x: contain"), "horizontal data areas should not drag the whole page");
assert.ok(css.includes("@media (prefers-reduced-motion: reduce)"), "motion preferences must be respected");
assert.ok(layout.includes('href="#main-content"'), "keyboard users must have a skip link");

console.log("Mobile UX contract passed.");
