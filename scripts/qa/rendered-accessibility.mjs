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
const publicRoutes = ["/", "/login", "/signup", "/pricing", "/privacy", "/terms", "/verify-email"];
const authenticatedRoutes = ["/", "/dashboard", "/jobs", "/jobs/new", "/vehicles", "/payments", "/settings", "/requirements", "/admin/research"];
const retiredAdminRoutes = ["/admin", "/admin/performance", "/admin/testers", "/admin/incidents"];
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
let foreignAccountId;
let jobId;
let completedJobId;
let vehicleId;
const testId = randomUUID();
const displayId = `QA-E2E-${testId}`;
const foreignDisplayId = `QA-UK-${testId}`;
const foreignProfileRoute = `/profile/${foreignDisplayId}`;
const email = "qa-rendered-browser@post2drive.invalid";
const password = "QA-test-only-password-42!";

async function scanRoute(page, route, viewport) {
  const response = await page.goto(new URL(route, baseURL).toString(), { waitUntil: "domcontentloaded" });
  assert.ok(response && response.status() < 400, `${route} should load successfully at ${viewport.label}`);
  const responseHeaders = response.headers();
  assert.equal(responseHeaders["x-content-type-options"], "nosniff", `${route} must send nosniff`);
  assert.equal(responseHeaders["x-frame-options"], "DENY", `${route} must deny framing`);
  assert.equal(responseHeaders["referrer-policy"], "strict-origin-when-cross-origin", `${route} must send a restrictive referrer policy`);
  assert.ok(responseHeaders["content-security-policy-report-only"]?.includes("report-uri /api/security/csp-report"),
    `${route} must retain the report-only CSP until violations are reviewed`);
  try {
    await page.locator("main h1").first().waitFor({ state: "visible" });
  } catch (error) {
    throw new Error(`${route} did not render a visible main heading at ${viewport.label}: ${error instanceof Error ? error.message : String(error)}`);
  }
  if (route.startsWith("/profile/")) {
    await page.waitForFunction(() => {
      const heading = document.querySelector("main h1")?.textContent?.trim();
      return Boolean(heading && heading !== "Public profile");
    });
  }

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
  // Let its short transform transition finish before measuring visibility; an
  // immediate computed-style snapshot can capture the off-screen animation frame.
  await page.waitForFunction(() => {
    const active = document.activeElement;
    if (!(active instanceof HTMLElement) || !active.matches(".skip-link")) return false;
    const rect = active.getBoundingClientRect();
    return rect.top >= 0 && rect.bottom <= window.innerHeight;
  }, null, { timeout: 1500 });
  const skipLink = await page.evaluate(() => {
    const active = document.activeElement;
    const style = active instanceof HTMLElement ? getComputedStyle(active) : null;
    return {
      className: active instanceof HTMLElement ? active.className : "",
      text: active?.textContent?.trim() || "",
      rect: active instanceof HTMLElement ? active.getBoundingClientRect().toJSON() : null,
      style: style ? {
        position: style.position,
        transform: style.transform,
        display: style.display,
        visibility: style.visibility,
        opacity: style.opacity,
      } : null,
      matchesFocus: active instanceof HTMLElement ? active.matches(":focus") : false,
      matchesFocusVisible: active instanceof HTMLElement ? active.matches(":focus-visible") : false,
      focusRules: (() => {
        const found = [];
        const visit = (rules) => {
          for (const rule of Array.from(rules)) {
            if (rule.selectorText?.includes(".skip-link:focus")) found.push(rule.cssText);
            if (rule.cssRules) visit(rule.cssRules);
          }
        };
        for (const sheet of Array.from(document.styleSheets)) {
          try { visit(sheet.cssRules); } catch { /* Cross-origin sheets are not inspectable. */ }
        }
        return found;
      })(),
      scrollY: window.scrollY,
    };
  });
  if (!String(skipLink.className).includes("skip-link") || !/skip to main content/i.test(skipLink.text)) {
    failures.push(`${route} does not focus the skip link first at ${viewport.label}`);
  } else if (!skipLink.rect || skipLink.rect.width <= 0 || skipLink.rect.height <= 0 || skipLink.rect.top < 0) {
    failures.push(`${route} skip link is not visible when focused at ${viewport.label}: ${JSON.stringify({ rect: skipLink.rect, style: skipLink.style, matchesFocus: skipLink.matchesFocus, matchesFocusVisible: skipLink.matchesFocusVisible, focusRules: skipLink.focusRules, scrollY: skipLink.scrollY })}`);
  }
}

try {
  const account = await prisma.account.create({
    data: {
      type: "both",
      companyName: "QA rendered accessibility fixture",
      displayId,
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
  const foreignAccount = await prisma.account.create({
    data: {
      type: "both",
      companyName: "QA foreign market fixture",
      displayId: foreignDisplayId,
      country: "GB",
      currency: "GBP",
    },
  });
  foreignAccountId = foreignAccount.id;

  for (const viewport of viewports) {
    const context = await browser.newContext({
      viewport: { width: viewport.width, height: viewport.height },
      reducedMotion: "reduce",
    });
    const page = await context.newPage();
    page.setDefaultTimeout(10_000);
    page.on("pageerror", error => failures.push(`[${viewport.label}] browser exception on ${new URL(page.url()).pathname}: ${error.message}`));

    for (const route of publicRoutes) await scanRoute(page, route, viewport);

    if (viewport.width === 320) {
      await page.goto(new URL("/signup", baseURL).toString(), { waitUntil: "domcontentloaded" });
      await page.getByLabel("Choose your market").selectOption("IN");
      // India intentionally has no registered-company-name field. Exercise its
      // market-specific first step without relying on UK/international fields.
      await page.getByRole("button", { name: "Continue" }).click();
      await page.waitForFunction(() => document.activeElement?.textContent?.trim() === "Vehicles & capacity");
      await page.getByRole("button", { name: "Back" }).click();
      await page.waitForFunction(() => document.activeElement?.textContent?.trim() === "Business setup");
    }

    await page.goto(new URL("/login", baseURL).toString(), { waitUntil: "domcontentloaded" });
    // The fixture is an India-market account, whose identifier label explicitly
    // permits email or phone; non-India accounts keep the email-only label.
    await page.getByLabel(/Email or phone number \(India accounts\)/).fill(email);
    await page.getByLabel("Password", { exact: true }).fill(password);
    await page.getByRole("button", { name: "Log in" }).click();
    await page.waitForURL(url => url.pathname === "/dashboard", { timeout: 15_000 });

    // The browser session must not be readable by client-side scripts and must
    // not accompany cross-site POST navigations/forms.
    const sessionCookie = (await context.cookies(baseURL)).find(cookie =>
      /^(?:__Secure-)?next-auth\.session-token$/.test(cookie.name)
    );
    assert.ok(sessionCookie, "authenticated browser flow must receive a NextAuth session cookie");
    assert.equal(sessionCookie.httpOnly, true, "session cookie must be HttpOnly");
    assert.equal(String(sessionCookie.sameSite).toLowerCase(), "lax",
      "session cookie must use SameSite=Lax to mitigate cross-site request forgery");

    const routesForViewport = [
      ...authenticatedRoutes,
      ...(jobId ? [`/jobs/${jobId}/edit`, `/jobs/${jobId}/incidents`] : []),
      `/profile/${displayId}`,
      foreignProfileRoute,
    ];
    for (const route of routesForViewport) {
      await scanRoute(page, route, viewport);
      if (route === foreignProfileRoute) {
        await page.getByRole("alert").filter({ hasText: "Profile not found in your marketplace." }).waitFor({ state: "visible" });
      }
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

    // The embedded operations dashboard is deliberately disabled in CI. Retired
    // internal admin routes must return the controlled 503 fallback, not be
    // mistaken for successful authenticated app pages.
    for (const route of retiredAdminRoutes) {
      const response = await page.goto(new URL(route, baseURL).toString(), { waitUntil: "domcontentloaded" });
      assert.equal(response?.status(), 503, `${route} should return the controlled disabled-dashboard response in CI`);
    }
    const adminFallbackResponse = await page.goto(new URL("/admin-access", baseURL).toString(), { waitUntil: "domcontentloaded" });
    assert.equal(adminFallbackResponse?.status(), 503, "The disabled admin dashboard must return its documented fallback status");
    await page.getByRole("heading", { name: "Admin dashboard unavailable" }).waitFor({ state: "visible" });
    const adminFallbackAxe = await new AxeBuilder({ page })
      .withTags(["wcag2a", "wcag2aa", "wcag21aa", "best-practice"])
      .analyze();
    for (const violation of adminFallbackAxe.violations) {
      failures.push(`admin dashboard unavailable fallback (${viewport.label}) ${violation.impact || "unknown"}: ${violation.id} — ${violation.help}`);
    }
    const adminFallbackOverflow = await page.evaluate(() => ({
      documentWidth: document.documentElement.scrollWidth,
      viewportWidth: document.documentElement.clientWidth,
    }));
    if (adminFallbackOverflow.documentWidth > adminFallbackOverflow.viewportWidth) {
      failures.push(`admin dashboard unavailable fallback overflows horizontally at ${viewport.label}`);
    }

    if (viewport.width === 320) {
      let failNextLoad = true;
      await page.route("**/api/jobs", async route => {
        if (failNextLoad) {
          failNextLoad = false;
          await route.fulfill({ status: 503, contentType: "application/json", body: JSON.stringify({ error: "Synthetic QA outage" }) });
        } else {
          // Make the recovery response deterministic: this test is about the UI
          // leaving its error state, not the live database's job inventory.
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ jobs: [] }),
          });
        }
      });
      await page.goto(new URL("/jobs", baseURL).toString(), { waitUntil: "domcontentloaded" });
      await page.getByRole("alert").filter({ hasText: "Synthetic QA outage" }).waitFor({ state: "visible" });
      assert.equal(await page.getByText("No jobs in this category.").count(), 0, "a failed marketplace load must not be shown as an empty list");
      await page.getByRole("button", { name: "Retry loading jobs" }).click();
      await page.getByText("No jobs in this category.").waitFor({ state: "visible" });
      await page.unroute("**/api/jobs");

      // A disconnected network request must be distinguished from an empty
      // marketplace and the Retry action must recover once connectivity returns.
      let disconnectNextLoad = true;
      await page.route("**/api/jobs", async route => {
        if (disconnectNextLoad) {
          disconnectNextLoad = false;
          await route.abort("internetdisconnected");
        } else {
          await route.fulfill({
            status: 200,
            contentType: "application/json",
            body: JSON.stringify({ jobs: [] }),
          });
        }
      });
      await page.goto(new URL("/jobs", baseURL).toString(), { waitUntil: "domcontentloaded" });
      await page.getByRole("alert").filter({ hasText: "Check your connection" }).waitFor({ state: "visible" });
      assert.equal(await page.getByText("No jobs in this category.").count(), 0,
        "a disconnected marketplace request must not be shown as an empty list");
      await page.getByRole("button", { name: "Retry loading jobs" }).click();
      await page.getByText("No jobs in this category.").waitFor({ state: "visible" });
      await page.unroute("**/api/jobs");
    }
    await context.close();

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
      const completedJob = await prisma.job.create({
        data: {
          posterId: accountId,
          pickup: "Vijayawada, Andhra Pradesh",
          dropoff: "Guntur, Andhra Pradesh",
          jobDate: new Date(Date.now() - 24 * 60 * 60 * 1000),
          pickupTime: "10:00",
          vehicleType: "Luton van",
          price: 500,
          currency: "INR",
          priceMode: "fixed",
          crossBorder: false,
          status: "completed",
          notes: "Local completed-payment QA fixture; automatically deleted.",
        },
      });
      completedJobId = completedJob.id;
      const vehicle = await prisma.vehicle.create({
        data: {
          accountId,
          vehicleType: "Luton van",
          regPlate: `QA-${testId.slice(0, 8)}`,
          ownershipType: "owned",
          make: "QA",
          model: "Test vehicle",
          motValidUntil: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
          insuranceValidUntil: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000),
        },
      });
      vehicleId = vehicle.id;
    }
  }
} finally {
  await browser.close();
  if (vehicleId) await prisma.vehicle.deleteMany({ where: { id: vehicleId } }).catch(error => failures.push(`QA vehicle cleanup failed: ${error instanceof Error ? error.message : String(error)}`));
  const fixtureJobIds = [jobId, completedJobId].filter(Boolean);
  const fixtureAccountIds = [accountId, foreignAccountId].filter(Boolean);
  let linkedJobIds = [];
  if (fixtureAccountIds.length) {
    try {
      // Browser journeys may create jobs through the API without assigning the
      // returned ID to this script. Discover every job linked to our isolated
      // fixture accounts before account deletion, not just the two direct ORM
      // fixtures above.
      linkedJobIds = (await prisma.job.findMany({
        where: {
          OR: [
            { posterId: { in: fixtureAccountIds } },
            { acceptedById: { in: fixtureAccountIds } },
          ],
        },
        select: { id: true },
      })).map(job => job.id);
    } catch (error) {
      failures.push(`QA linked-job inventory failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  const cleanupJobIds = [...new Set([...fixtureJobIds, ...linkedJobIds])];
  if (cleanupJobIds.length) {
    try {
      // Bid and Rating references do not cascade on Job deletion. Remove rows
      // tied to fixture jobs/accounts before deleting the jobs and accounts.
      await prisma.$transaction([
        prisma.bid.deleteMany({
          where: {
            OR: [
              { jobId: { in: cleanupJobIds } },
              { bidderId: { in: fixtureAccountIds } },
            ],
          },
        }),
        prisma.rating.deleteMany({
          where: {
            OR: [
              { jobId: { in: cleanupJobIds } },
              { raterId: { in: fixtureAccountIds } },
              { rateeId: { in: fixtureAccountIds } },
            ],
          },
        }),
        prisma.job.deleteMany({ where: { id: { in: cleanupJobIds } } }),
      ]);
    } catch (error) {
      failures.push(`QA job fixture cleanup failed: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  if (foreignAccountId) await prisma.account.deleteMany({ where: { id: foreignAccountId } }).catch(error => failures.push(`QA foreign account cleanup failed: ${error instanceof Error ? error.message : String(error)}`));
  if (accountId) await prisma.account.deleteMany({ where: { id: accountId } }).catch(error => failures.push(`QA account cleanup failed: ${error instanceof Error ? error.message : String(error)}`));
  await prisma.$disconnect();
}

if (failures.length) {
  console.error("Rendered accessibility checks failed:");
  for (const failure of failures) console.error(`- ${failure}`);
  process.exitCode = 1;
} else {
  console.log(`Rendered accessibility checks passed for ${publicRoutes.length} public and ${authenticatedRoutes.length} authenticated route visits across ${viewports.length} viewport sizes, including WCAG axe rules, horizontal overflow and first-tab skip navigation.`);
}
