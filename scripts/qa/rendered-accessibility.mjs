#!/usr/bin/env node
import assert from "node:assert/strict";
import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";

const baseURL = process.env.POST2DRIVE_BASE_URL || "http://127.0.0.1:3000";
const routes = ["/", "/login", "/signup"];
const viewports = [
  { width: 320, height: 800, label: "small mobile" },
  { width: 390, height: 844, label: "mobile" },
  { width: 768, height: 1024, label: "tablet" },
  { width: 1440, height: 900, label: "desktop" },
];
const browser = await chromium.launch({ headless: true });
const failures = [];

try {
  for (const viewport of viewports) {
    const page = await browser.newPage({ viewport: { width: viewport.width, height: viewport.height }, reducedMotion: "reduce" });
    page.setDefaultTimeout(10_000);
    page.on("pageerror", error => failures.push(`[${viewport.label}] browser exception: ${error.message}`));

    for (const route of routes) {
      const response = await page.goto(new URL(route, baseURL).toString(), { waitUntil: "networkidle" });
      assert.ok(response && response.status() < 400, `${route} should load successfully at ${viewport.label}`);
      await page.locator("main h1").first().waitFor({ state: "visible" });

      const overflow = await page.evaluate(() => ({
        documentWidth: document.documentElement.scrollWidth,
        viewportWidth: document.documentElement.clientWidth,
      }));
      if (overflow.documentWidth > overflow.viewportWidth) {
        failures.push(`${route} overflows horizontally at ${viewport.label}: ${overflow.documentWidth}px > ${overflow.viewportWidth}px`);
      }

      const axe = await new AxeBuilder({ page })
        .withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "wcag22aa", "best-practice"])
        .analyze();
      for (const violation of axe.violations) {
        failures.push(`${route} (${viewport.label}) ${violation.impact || "unknown"}: ${violation.id} — ${violation.help}; ${violation.nodes.slice(0, 3).map(node => node.target.join(" ")).join(", ")}`);
      }

      // The skip link must be the first keyboard stop and become visible on focus.
      await page.keyboard.press("Tab");
      const skipLink = await page.evaluate(() => {
        const active = document.activeElement;
        return {
          className: active instanceof HTMLElement ? active.className : "",
          text: active?.textContent?.trim() || "",
          rect: active instanceof HTMLElement ? active.getBoundingClientRect().toJSON() : null,
        };
      });
      if (!String(skipLink.className).includes("skip-link") || !/skip to main content/i.test(skipLink.text)) {
        failures.push(`${route} does not focus the skip link first at ${viewport.label}`);
      } else if (!skipLink.rect || skipLink.rect.width <= 0 || skipLink.rect.height <= 0 || skipLink.rect.top < 0) {
        failures.push(`${route} skip link is not visible when focused at ${viewport.label}`);
      }
    }
    await page.close();
  }
} finally {
  await browser.close();
}

if (failures.length) {
  console.error("Rendered accessibility checks failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log(`Rendered accessibility checks passed for ${routes.length} public routes across ${viewports.length} viewport sizes, including WCAG axe rules, horizontal overflow and first-tab skip navigation.`);
}
