#!/usr/bin/env node
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { chromium } from "playwright";
import AxeBuilder from "@axe-core/playwright";

assert.equal(process.env.CI, "true", "Rendered browser QA must run only in CI.");
const databaseUrl = new URL(process.env.DATABASE_URL || "");
assert.ok(["localhost", "127.0.0.1"].includes(databaseUrl.hostname), "E2E fixture must use local CI PostgreSQL");
const baseURL = process.env.POST2DRIVE_BASE_URL || "http://localhost:3000";
const publicRoutes = ["/", "/login", "/signup"];
const authenticatedRoutes = ["/", "/dashboard", "/jobs", "/jobs/new", "/vehicles", "/payments", "/settings", "/requirements"];
const viewports = [
  { width: 320, height: 800, label: "small mobile" },
  { width: 390, height: 844, label: "mobile" },
  { width: 768, height: 1024, label: "tablet" },
  { width: 1440, height: 900, label: "desktop" },
];
const failures = [];
const prisma = new PrismaClient();
const browser = await chromium.launch({ headless: true });
let accountId;
let jobId;
const testId = randomUUID();
const email = `qa-rendered-${testId}@post2drive.invalid`;
const password = "QA-test-only-password-42!";

async function scanRoute(page, route, viewport) {
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

try {
  const account = await prisma.account.create({
    data: {
      type: "both",
      companyName: "QA rendered accessibility fixture",
      displayId: `QA-E2E-${testId}`,
      country: "IN",
      currency: "INR",
      users: {
        create: {
          name: "QA Browser User",
          email,
          phone: "",
          passwordHash: await bcrypt.hash(password, 4),
          emailVerifiedAt: new Date(),
        },
      },
    },
  });
  accountId = account.id;

  for (const viewport of viewports) {
    const page = await browser.newPage({
      viewport: { width: viewport.width, height: viewport.height },
      reducedMotion: "reduce",
    });
    page.setDefaultTimeout(10_000);
    page.on("pageerror", error => failures.push(`[${viewport.label}] browser exception: ${error.message}`));

    for (const route of publicRoutes) await scanRoute(page, route, viewport);

    if (viewport.width === 320) {
      await page.goto(new URL("/signup", baseURL).toString(), { waitUntil: "networkidle" });
      await page.getByLabel("Choose your market").selectOption("IN");
      await page.getByLabel("Registered company name").fill("QA accessibility fixture business");
      await page.getByRole("button", { name: "Continue" }).click();
      await page.waitForFunction(() => document.activeElement?.textContent?.trim() === "Vehicles & capacity");
      await page.getByRole("button", { name: "Back" }).click();
      await page.waitForFunction(() => document.activeElement?.textContent?.trim() === "Business setup");
    }

    await page.goto(new URL("/login", baseURL).toString(), { waitUntil: "networkidle" });
    await page.getByLabel("Email", { exact: true }).fill(email);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Log in" }).click();
    await page.waitForURL(url => url.pathname === "/dashboard", { timeout: 15_000 });

    const routesForViewport = [
      ...authenticatedRoutes,
      ...(jobId ? [`/jobs/${jobId}/edit`, `/jobs/${jobId}/incidents`] : []),
    ];
    for (const route of routesForViewport) {
      await scanRoute(page, route, viewport);
      if (route === "/jobs/new" && viewport.width === 320) {
        await page.getByLabel(/Pickup location/).fill("Hyderabad, Telangana");
        await page.getByLabel(/Drop-off location/).fill("Vijayawada, Andhra Pradesh");
        await page.getByLabel(/Pickup date/).fill(new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10));
        await page.getByLabel(/Pickup time/).fill("10:00");
        await page.getByRole("button", { name: "Continue" }).click();
        await page.waitForFunction(() => document.activeElement?.textContent?.trim() === "What needs moving?");
        await page.getByLabel(/Total job price/).fill("2500");
        await page.getByRole("button", { name: "Continue" }).click();
        await page.waitForFunction(() => document.activeElement?.textContent?.trim() === "Contacts, notes & review");
      }
      if (route === "/dashboard" && viewport.width <= 700) {
        const more = page.locator(".mobile-nav-more");
        await more.click();
        assert.equal(await more.getAttribute("aria-expanded"), "true", "mobile More button must expose expanded state");
        assert.equal(await page.locator("#mobile-more-menu").isVisible(), true, "mobile More menu must open");
        assert.equal(await page.getByRole("link", { name: "My Requirements" }).isVisible(), true, "India accounts must see My Requirements in More");
        const menuAxe = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa", "best-practice"]).analyze();
        for (const violation of menuAxe.violations) failures.push(`mobile More menu (${viewport.label}) ${violation.impact || "unknown"}: ${violation.id} — ${violation.help}`);
        await page.keyboard.press("Escape");
        assert.equal(await more.getAttribute("aria-expanded"), "false", "Escape must collapse mobile More menu");
        assert.equal(await page.locator("#mobile-more-menu").isVisible(), false, "Escape must hide mobile More menu");
        assert.equal(await more.evaluate(element => element === document.activeElement), true, "Escape must return focus to More trigger");
      }
    }

    if (viewport.width === 320) {
      let failNextLoad = true;
      await page.route("**/api/jobs", async route => {
        if (failNextLoad) {
          failNextLoad = false;
          await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "Synthetic QA outage" }) });
        } else {
          await route.continue();
        }
      });
      await page.goto(new URL("/jobs", baseURL).toString(), { waitUntil: "networkidle" });
      await page.getByRole("alert").filter({ hasText: "Synthetic QA outage" }).waitFor({ state: "visible" });
      assert.equal(await page.getByText("No jobs in this category.").count(), 0, "a failed marketplace load must not be shown as an empty list");
      await page.getByRole("button", { name: "Retry loading jobs" }).click();
      await page.getByText("No jobs in this category.").waitFor({ state: "visible" });
      await page.unroute("**/api/jobs");
    }
    await page.close();

    // Keep the smallest viewport as an empty-state pass; populate the local CI
    // account afterwards so later viewport passes cover realistic job cards.
    if (viewport.width === 320) {
      assert.ok(accountId, "local browser QA account must exist before creating the job fixture");
      const job = await prisma.job.create({
        data: {
          posterId: accountId,
          pickup: "Hyderabad, Telangana",
          dropoff: "Vijayawada, Andhra Pradesh",
          jobDate: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
          pickupTime: "10:00",
          vehicleType: "Luton van",
          price: 2500,
          currency: "INR",
          priceMode: "fixed",
          crossBorder: false,
          notes: "Local browser QA fixture; automatically deleted with its account.",
        },
      });
      jobId = job.id;
    }
  }
} finally {
  await browser.close();
  if (jobId) await prisma.job.deleteMany({ where: { id: jobId } }).catch(() => {});
  if (accountId) await prisma.account.deleteMany({ where: { id: accountId } }).catch(() => {});
  await prisma.$disconnect();
}

if (failures.length) {
  console.error("Rendered accessibility checks failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log(`Rendered accessibility checks passed for ${publicRoutes.length} public and ${authenticatedRoutes.length} authenticated route visits across ${viewports.length} viewport sizes, including WCAG axe rules, horizontal overflow and first-tab skip navigation.`);
}
