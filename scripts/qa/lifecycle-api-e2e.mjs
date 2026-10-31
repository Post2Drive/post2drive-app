#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { setTimeout as delay } from "node:timers/promises";
import { createHmac } from "node:crypto";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

async function getAvailablePort() {
  const socket = createServer();
  await new Promise((resolve, reject) => {
    socket.once("error", reject);
    socket.listen(0, "127.0.0.1", resolve);
  });
  const address = socket.address();
  if (!address || typeof address === "string") {
    await new Promise((resolve) => socket.close(resolve));
    throw new Error("Could not determine an available local TCP port");
  }
  await new Promise((resolve, reject) => socket.close((error) => error ? reject(error) : resolve()));
  return address.port;
}
const suffix = process.pid + "-" + Date.now();
const accountIds = [];
const jobIds = [];
const notificationIds = [];
let server;
let serverOutput = "";
let base = "";
let poster, driver, outsider, indiaPoster, lifecycleJob, bidJob, bid, incident, evidence, posterVehicle, incidentJob, cancelJob, acceptJob, unassignJob, rejectJob, indiaJob, notification;

async function snapshot() {
  const [jobRows, jobCount, bidCount, activityCount, evidenceCount, vehicleCount, notificationCount, notificationRows, ratingCount] = await Promise.all([
    prisma.job.findMany({
      where: { id: { in: jobIds } },
      select: { id: true, posterId: true, acceptedById: true, status: true, priceMode: true, deliveryMarkedById: true, paidMarkedAt: true, receivedConfirmedAt: true },
    }),
    prisma.job.count({ where: { posterId: { in: accountIds } } }),
    prisma.bid.count({ where: { jobId: { in: jobIds } } }),
    prisma.jobActivity.count({ where: { jobId: { in: jobIds } } }),
    prisma.incidentEvidence.count({ where: { jobId: { in: jobIds } } }),
    prisma.vehicle.count({ where: { accountId: { in: accountIds } } }),
    prisma.notification.count({ where: { accountId: { in: accountIds } } }),
    prisma.notification.findMany({
      where: { id: { in: notificationIds } },
      select: { id: true, accountId: true, readAt: true },
    }),
    prisma.rating.count({ where: { jobId: { in: jobIds } } }),
  ]);
  return { jobRows, jobCount, bidCount, activityCount, evidenceCount, vehicleCount, notificationCount, notificationRows, ratingCount };
}
const getSetCookies = (response) => {
  if (typeof response.headers.getSetCookie === "function") return response.headers.getSetCookie();
  const single = response.headers.get("set-cookie");
  return single ? [single] : [];
};
async function signIn(email, password = "ci-e2e-password-12345") {
  const csrfResponse = await fetch(base + "/api/auth/csrf", { cache: "no-store", signal: AbortSignal.timeout(8000) });
  assert.equal(csrfResponse.status, 200, "NextAuth CSRF endpoint must be available");
  const csrf = await csrfResponse.json();
  const csrfCookie = getSetCookies(csrfResponse).map((value) => value.split(";")[0]).join("; ");
  assert.ok(csrfCookie, "NextAuth must issue a CSRF cookie");
  const callback = await fetch(base + "/api/auth/callback/credentials", {
    method: "POST",
    headers: {
      cookie: csrfCookie,
      "content-type": "application/x-www-form-urlencoded",
      "x-auth-return-redirect": "true",
    },
    body: new URLSearchParams({
      csrfToken: csrf.csrfToken,
      callbackUrl: base,
      email,
      password,
    }),
    redirect: "manual",
    signal: AbortSignal.timeout(8000),
  });
  const allCookies = getSetCookies(callback);
  const sessionCookies = allCookies.filter((value) =>
    /^(?:__Secure-)?next-auth\.session-token=/.test(value)
  );
  if (!sessionCookies.length) {
    throw new Error("Real NextAuth credentials sign-in did not issue a session cookie (HTTP " +
      callback.status + "): " + (await callback.text()).slice(0, 500));
  }
  assert.ok(sessionCookies.every(value => /HttpOnly/i.test(value)), "session cookie must be HttpOnly");
  assert.ok(sessionCookies.every(value => /SameSite=Lax/i.test(value)), "session cookie must use SameSite=Lax");
  assert.ok(sessionCookies.every(value => /Secure/i.test(value)), "production session cookie must be Secure");
  return sessionCookies.map((value) => value.split(";")[0]).join("; ");
}
async function api(path, method, cookie, body) {
  const headers = {};
  if (cookie) headers.cookie = cookie;
  if (body !== undefined) headers["content-type"] = "application/json";
  return fetch(base + path, {
    method,
    headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(8000),
  });
}
async function apiFormData(path, method, cookie, formData) {
  const headers = {};
  if (cookie) headers.cookie = cookie;
  return fetch(base + path, {
    method, headers, body: formData, cache: "no-store", signal: AbortSignal.timeout(8000),
  });
}
const makeEvidenceForm = () => {
  const form = new FormData();
  form.append("file", new Blob(["%PDF-1.4\\n% isolated CI evidence\\n%%EOF\\n"], { type: "application/pdf" }), "ci-evidence.pdf");
  return form;
};
const denyStatuses = new Set([400, 401, 403, 404, 409, 422]);
try {
  poster = await prisma.account.create({ data: {
    type: "poster", companyName: "CI lifecycle poster", displayId: "CIP-" + suffix,
    country: "GB", currency: "GBP", verificationStatus: "verified",
    companyVerificationStatus: "verified", companyVerifiedAt: new Date(),
    subscriptionStatus: "active", subscriptionPlanKey: "individual",
    subscriptionStartedAt: new Date(), subscriptionEndsAt: new Date("2035-12-31T00:00:00.000Z"),
  }});
  driver = await prisma.account.create({ data: {
    type: "driver", companyName: "CI lifecycle driver", displayId: "CID-" + suffix,
    country: "GB", currency: "GBP", verificationStatus: "verified",
    subscriptionStatus: "active", subscriptionPlanKey: "individual",
    subscriptionStartedAt: new Date(), subscriptionEndsAt: new Date("2035-12-31T00:00:00.000Z"),
  }});
  outsider = await prisma.account.create({ data: {
    type: "both", companyName: "CI unrelated account", displayId: "CIO-" + suffix,
    country: "GB", currency: "GBP", verificationStatus: "verified",
    subscriptionStatus: "active", subscriptionPlanKey: "individual",
    subscriptionStartedAt: new Date(), subscriptionEndsAt: new Date("2035-12-31T00:00:00.000Z"),
  }});
  // India follows phone-only access: no person/company verification or paid plan.
  indiaPoster = await prisma.account.create({ data: {
    type: "poster", companyName: "CI India poster", displayId: "CII-" + suffix,
    country: "IN", currency: "INR", phoneVerifiedAt: new Date(),
    verificationStatus: "not_started", companyVerificationStatus: "not_started",
  }});
  accountIds.push(poster.id, driver.id, outsider.id, indiaPoster.id);
  const passwordHash = await bcrypt.hash("ci-e2e-password-12345", 8);
  const posterUser = await prisma.user.create({ data: {
    accountId: poster.id, name: "CI Poster", email: "ci-poster-" + suffix + "@example.invalid",
    phone: "poster-" + suffix, passwordHash, emailVerifiedAt: new Date(),
  }});
  const driverUser = await prisma.user.create({ data: {
    accountId: driver.id, name: "CI Driver", email: "ci-driver-" + suffix + "@example.invalid",
    phone: "driver-" + suffix, passwordHash, emailVerifiedAt: new Date(),
  }});
  const outsiderUser = await prisma.user.create({ data: {
    accountId: outsider.id, name: "CI Outsider", email: "ci-outsider-" + suffix + "@example.invalid",
    phone: "outsider-" + suffix, passwordHash, emailVerifiedAt: new Date(),
  }});
  const indiaUser = await prisma.user.create({ data: {
    accountId: indiaPoster.id, name: "CI India Poster", email: "ci-india-" + suffix + "@example.invalid",
    phone: "india-" + suffix, passwordHash, emailVerifiedAt: new Date(),
  }});

  lifecycleJob = await prisma.job.create({ data: {
    posterId: poster.id, acceptedById: driver.id, status: "accepted", priceMode: "fixed",
    pickup: "CI fixture pickup", dropoff: "CI fixture dropoff",
    jobDate: new Date(Date.now() + 86_400_000), pickupTime: "10:00", dropoffTime: "14:00",
    pickupTimeZone: "Europe/London", dropoffTimeZone: "Europe/London",
    vehicleType: "Small van (SWB)", price: 100, currency: "GBP", crossBorder: false,
  }});
  bidJob = await prisma.job.create({ data: {
    posterId: poster.id, status: "open", priceMode: "bid",
    pickup: "CI bid pickup", dropoff: "CI bid dropoff",
    jobDate: new Date(Date.now() + 172_800_000), pickupTime: "10:00", dropoffTime: "14:00",
    pickupTimeZone: "Europe/London", dropoffTimeZone: "Europe/London",
    vehicleType: "Small van (SWB)", price: 100, currency: "GBP", crossBorder: false,
  }});
  notification = await prisma.notification.create({ data: {
    accountId: driver.id, type: "job_update", title: "CI notification",
    body: "Private notification fixture", jobId: lifecycleJob.id, metadata: { ci: true },
  }});
  notificationIds.push(notification.id);
  jobIds.push(lifecycleJob.id, bidJob.id);
  const baseFixtureJob = {
    posterId: poster.id,
    pickup: "CI alternative pickup",
    dropoff: "CI alternative dropoff",
    pickupTime: "10:00",
    dropoffTime: "14:00",
    pickupTimeZone: "Europe/London",
    dropoffTimeZone: "Europe/London",
    vehicleType: "Small van (SWB)",
    price: 100,
    currency: "GBP",
    crossBorder: false,
    priceMode: "fixed",
  };
  incidentJob = await prisma.job.create({ data: {
    ...baseFixtureJob, status: "accepted", acceptedById: driver.id,
    jobDate: new Date(Date.now() + 3 * 86_400_000),
  }});
  cancelJob = await prisma.job.create({ data: {
    ...baseFixtureJob, status: "open",
    jobDate: new Date(Date.now() + 4 * 86_400_000),
  }});
  acceptJob = await prisma.job.create({ data: {
    ...baseFixtureJob, status: "open",
    jobDate: new Date(Date.now() + 10 * 86_400_000), pickupTime: "16:00", dropoffTime: "18:00",
  }});
  unassignJob = await prisma.job.create({ data: {
    ...baseFixtureJob, status: "accepted", acceptedById: driver.id,
    jobDate: new Date(Date.now() + 5 * 86_400_000),
  }});
  rejectJob = await prisma.job.create({ data: {
    ...baseFixtureJob, status: "delivered", acceptedById: driver.id, deliveryMarkedById: driver.id,
    jobDate: new Date(Date.now() + 6 * 86_400_000),
  }});
  jobIds.push(incidentJob.id, cancelJob.id, acceptJob.id, unassignJob.id, rejectJob.id);
  incident = await prisma.jobActivity.create({ data: {
    jobId: lifecycleJob.id, actorId: poster.id, action: "INCIDENT_REPORTED",
    description: "isolated incident fixture", metadata: { reason: "vehicle_breakdown" },
  }});
  evidence = await prisma.incidentEvidence.create({ data: {
    jobId: lifecycleJob.id, incidentId: incident.id, uploadedById: poster.id,
    fileName: "isolated.txt", mimeType: "text/plain", sizeBytes: 5,
    sha256: "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
    content: Buffer.from("hello"),
  }});
  posterVehicle = await prisma.vehicle.create({ data: {
    accountId: poster.id, vehicleType: "Small van (SWB)", regPlate: "CI-" + suffix,
    verificationStatus: "verified",
  }});
  await prisma.vehicle.create({ data: {
    accountId: driver.id, vehicleType: "Small van (SWB)", regPlate: "CID-" + suffix,
    verificationStatus: "verified", verifiedAt: new Date(),
    motValidUntil: new Date("2035-12-31T00:00:00.000Z"),
    insuranceValidUntil: new Date("2035-12-31T00:00:00.000Z"),
  }});

  const port = await getAvailablePort();
  base = "http://127.0.0.1:" + port;
  server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--port", String(port)], {
    env: {
      ...process.env,
      NEXTAUTH_URL: base,
      NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET || "ci-only-secret",
      OPS_DASHBOARD_BRIDGE_SECRET: "ci-only-admin-bridge-secret-at-least-32-bytes",
      SUBSCRIPTION_WEBHOOK_SECRET: "ci-only-subscription-webhook-secret",
      VERIFICATION_WEBHOOK_SECRET: "ci-only-verification-webhook-secret",
      NODE_ENV: "production",
    },
    stdio: ["ignore", "pipe", "pipe"],
  });
  server.stdout.on("data", (b) => { serverOutput += b.toString(); });
  server.stderr.on("data", (b) => { serverOutput += b.toString(); });

  let ready = false;
  for (let attempt = 0; attempt < 100; attempt++) {
    if (server.exitCode !== null) throw new Error("Next.js server exited during startup:\n" + serverOutput);
    try {
      const health = await fetch(base + "/api/health", { signal: AbortSignal.timeout(2000) });
      if (health.status === 200) { ready = true; break; }
    } catch {}
    await delay(200);
  }
  assert.equal(ready, true, "isolated Next.js app must become ready:\n" + serverOutput);

  // Keep two independent credentials sessions for the same user, as if they
  // were separate browser profiles. A password change must revoke both JWTs.
  const firstOutsiderCookie = await signIn(outsiderUser.email);
  const secondOutsiderCookie = await signIn(outsiderUser.email);
  const posterCookie = await signIn(posterUser.email);
  const driverCookie = await signIn(driverUser.email);
  const indiaCookie = await signIn(indiaUser.email);

  const oldSessionA = await api("/api/auth/session", "GET", firstOutsiderCookie);
  const oldSessionB = await api("/api/auth/session", "GET", secondOutsiderCookie);
  assert.ok((await oldSessionA.json())?.user?.email === outsiderUser.email,
    "first independent browser session should be authenticated before password change");
  assert.ok((await oldSessionB.json())?.user?.email === outsiderUser.email,
    "second independent browser session should be authenticated before password change");

  const passwordChanged = await api("/api/account", "PATCH", firstOutsiderCookie, {
    currentPassword: "ci-e2e-password-12345",
    newPassword: "ci-e2e-password-67890",
  });
  assert.equal(passwordChanged.status, 200,
    "authenticated account should be able to change its password (got " + passwordChanged.status + "): " + await passwordChanged.text());

  const revokedSessionA = await api("/api/auth/session", "GET", firstOutsiderCookie);
  const revokedSessionB = await api("/api/auth/session", "GET", secondOutsiderCookie);
  assert.equal(await revokedSessionA.text(), "null",
    "password change must revoke the first pre-existing browser session");
  assert.equal(await revokedSessionB.text(), "null",
    "password change must revoke the second pre-existing browser session");

  const firstFreshCookie = await signIn(outsiderUser.email, "ci-e2e-password-67890");
  const freshSession = await api("/api/auth/session", "GET", firstFreshCookie);
  assert.equal((await freshSession.json())?.user?.email, outsiderUser.email,
    "re-login with the new password should create a valid fresh session");

  const unknownForgot = await api("/api/auth/forgot-password", "POST", null, { email: "not-a-real-account@example.invalid" });
  assert.equal(unknownForgot.status, 200, "forgot-password request should not disclose whether an account exists");
  assert.match((await unknownForgot.json()).message, /If an account exists/i,
    "forgot-password request should return a generic response");

  // Seed a one-hour reset token in the isolated database to exercise the real
  // reset HTTP handler without depending on a live email provider.
  const resetToken = "ci-reset-token-" + suffix;
  const resetTokenHash = createHmac("sha256", process.env.NEXTAUTH_SECRET || "ci-only-secret").update(resetToken).digest("hex");
  await prisma.passwordResetToken.create({ data: {
    userId: outsiderUser.id,
    tokenHash: resetTokenHash,
    expiresAt: new Date(Date.now() + 60 * 60 * 1000),
    lastSentAt: new Date(),
  } });
  const resetResponse = await api("/api/auth/reset-password", "POST", null, {
    token: resetToken, password: "ci-e2e-password-reset-12345",
  });
  assert.equal(resetResponse.status, 200,
    "valid reset token should update password and revoke sessions (got " + resetResponse.status + "): " + await resetResponse.text());
  assert.equal(await (await api("/api/auth/session", "GET", firstFreshCookie)).text(), "null",
    "password reset must revoke an existing browser session");
  const reusedReset = await api("/api/auth/reset-password", "POST", null, {
    token: resetToken, password: "ci-e2e-password-reused-12345",
  });
  assert.equal(reusedReset.status, 400, "a consumed reset token must not be reusable");
  await assert.rejects(
    () => signIn(outsiderUser.email, "ci-e2e-password-67890"),
    /did not issue a session cookie/,
    "the previous password must no longer authenticate after reset",
  );
  const outsiderCookie = await signIn(outsiderUser.email, "ci-e2e-password-reset-12345");
  assert.equal((await (await api("/api/auth/session", "GET", outsiderCookie)).json())?.user?.email, outsiderUser.email,
    "new password should create a valid session after reset");

  const accountRead = await api("/api/account", "GET", outsiderCookie);
  assert.equal(accountRead.status, 200);
  const accountReadBody = await accountRead.json();
  assert.equal(accountReadBody.account.id, outsider.id);
  assert.deepEqual(accountReadBody.account.users.map(user => user.id), [outsiderUser.id]);
  for (const field of ["subscriptionStatus", "subscriptionPlanKey", "isTester", "verificationStatus", "deletionRequestedAt"]) {
    assert.equal(Object.hasOwn(accountReadBody.account, field), false, "account API must not expose internal field " + field);
  }
  assert.equal(Object.hasOwn(accountReadBody.account.users[0], "passwordHash"), false);
  const accountMarketAttack = await api("/api/account", "PATCH", outsiderCookie, {
    accountId: poster.id, country: "IN", currency: "INR",
  });
  assert.equal(accountMarketAttack.status, 409, "account settings must reject immutable market changes");
  assert.deepEqual(await prisma.account.findUnique({ where: { id: outsider.id }, select: { country: true, currency: true } }),
    { country: "GB", currency: "GBP" });
  assert.deepEqual(await prisma.account.findUnique({ where: { id: poster.id }, select: { country: true, currency: true } }),
    { country: "GB", currency: "GBP" }, "client accountId must not redirect settings mutation");

  for (const path of [
    "/api/admin/company-verification", "/api/admin/incidents/resolve",
    "/api/admin/research", "/api/admin/testers", "/api/admin/qa-campaigns",
  ]) {
    assert.equal((await api(path, "GET", outsiderCookie)).status, 403,
      path + " must deny a normal authenticated user");
  }

  const bridgeSecret = "ci-only-admin-bridge-secret-at-least-32-bytes";
  const bridgeBody = JSON.stringify({ action: "unsupported-ci-contract-action", actor: "qa-e2e" });
  const bridgeNonce = randomUUID().replaceAll("-", "");
  const bridgeTimestamp = String(Date.now());
  const bridgeSignature = createHmac("sha256", bridgeSecret)
    .update(bridgeTimestamp + "." + bridgeNonce + "." + bridgeBody).digest("hex");
  const bridgeHeaders = {
    "content-type": "application/json", "x-p2d-admin-timestamp": bridgeTimestamp,
    "x-p2d-admin-nonce": bridgeNonce, "x-p2d-admin-signature": bridgeSignature,
  };
  const invalidBridge = await fetch(base + "/api/internal/admin-bridge", {
    method: "POST", headers: { ...bridgeHeaders, "x-p2d-admin-signature": "00".repeat(32) },
    body: bridgeBody, cache: "no-store",
  });
  assert.equal(invalidBridge.status, 401, "bridge must reject an invalid signature");
  const staleBridge = await fetch(base + "/api/internal/admin-bridge", {
    method: "POST", headers: { ...bridgeHeaders, "x-p2d-admin-timestamp": String(Date.now() - 5 * 60 * 1000) },
    body: bridgeBody, cache: "no-store",
  });
  assert.equal(staleBridge.status, 401, "bridge must reject expired timestamps");
  const validBridge = await fetch(base + "/api/internal/admin-bridge", {
    method: "POST", headers: bridgeHeaders, body: bridgeBody, cache: "no-store",
  });
  assert.equal(validBridge.status, 400, "valid signed bridge request must reach action validation");
  const replayBridge = await fetch(base + "/api/internal/admin-bridge", {
    method: "POST", headers: bridgeHeaders, body: bridgeBody, cache: "no-store",
  });
  assert.equal(replayBridge.status, 409, "bridge must reject a replayed nonce");

  for (const [path, header] of [
    ["/api/subscription/webhook", "x-post2drive-webhook-secret"],
    ["/api/verification/start/webhook", "x-verification-webhook-secret"],
  ]) {
    const noCredential = await fetch(base + path, { method: "POST", headers: { "content-type": "application/json" }, body: "{}" });
    assert.equal(noCredential.status, 401, path + " must reject missing credentials");
    const wrongCredential = await fetch(base + path, {
      method: "POST", headers: { "content-type": "application/json", [header]: "wrong-secret" }, body: "{}",
    });
    assert.equal(wrongCredential.status, 401, path + " must reject incorrect credentials");
  }
  const corsProbe = await fetch(base + "/api/account", {
    method: "GET", headers: { cookie: outsiderCookie, origin: "https://attacker.invalid" }, cache: "no-store",
  });
  assert.equal(corsProbe.headers.get("access-control-allow-origin"), null,
    "authenticated APIs must not grant arbitrary cross-origin browser access");

  // Product/Quality cross-market HTTP checks: country and currency come from
  // the signed-in account, never from client-supplied request fields.
  const indiaCreate = await api("/api/jobs", "POST", indiaCookie, {
    pickup: "CI Hyderabad pickup", dropoff: "CI Vijayawada dropoff",
    jobDate: new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10),
    pickupTime: "10:00", dropoffTime: "14:00",
    pickupTimeZone: "Asia/Kolkata", dropoffTimeZone: "Asia/Kolkata",
    vehicleType: "Small van (SWB)", price: null, priceMode: "fixed", currency: "INR", crossBorder: false,
  });
  if (indiaCreate.status !== 201) {
    throw new Error("India phone-verified account must post without person/company verification or a paid plan (got " +
      indiaCreate.status + "): " + await indiaCreate.text());
  }
  const indiaJobBody = await indiaCreate.json();
  indiaJob = indiaJobBody.job;
  assert.ok(indiaJob?.id, "India job creation must return a persistent job");
  jobIds.push(indiaJob.id);
  const indiaAccountAfterPost = await prisma.account.findUnique({
    where: { id: indiaPoster.id },
    select: { country: true, currency: true, verificationStatus: true, companyVerificationStatus: true, phoneVerifiedAt: true, subscriptionStatus: true },
  });
  assert.equal(indiaAccountAfterPost.country, "IN");
  assert.equal(indiaAccountAfterPost.currency, "INR");
  assert.equal(indiaAccountAfterPost.verificationStatus, "not_started",
    "India job posting must not require UK person verification");
  assert.equal(indiaAccountAfterPost.companyVerificationStatus, "not_started",
    "India job posting must not require company verification");
  assert.ok(indiaAccountAfterPost.phoneVerifiedAt, "India posting fixture must prove phone verification");
  assert.notEqual(indiaAccountAfterPost.subscriptionStatus, "active",
    "India posting fixture must not rely on a paid subscription");

  const indiaOwnJob = await api("/api/jobs/" + indiaJob.id, "GET", indiaCookie);
  assert.equal(indiaOwnJob.status, 200, "India poster can read its own INR job");
  const ukToIndiaBefore = await snapshot();
  const ukToIndia = await api("/api/jobs/" + indiaJob.id, "GET", posterCookie);
  assert.equal(ukToIndia.status, 403, "GB account must not read an INR job by ID");
  assert.deepEqual(await snapshot(), ukToIndiaBefore, "GB cross-market read must not change state");
  const indiaToUkBefore = await snapshot();
  const indiaToUk = await api("/api/jobs/" + lifecycleJob.id, "GET", indiaCookie);
  assert.equal(indiaToUk.status, 403, "IN account must not read a GBP job by ID");
  assert.deepEqual(await snapshot(), indiaToUkBefore, "IN cross-market read must not change state");

  const ukProfileLeak = await api("/api/profile/" + indiaPoster.displayId, "GET", posterCookie);
  assert.equal(ukProfileLeak.status, 404, "foreign-market profile must be indistinguishable from missing");
  const indiaOwnProfile = await api("/api/profile/" + indiaPoster.displayId, "GET", indiaCookie);
  assert.equal(indiaOwnProfile.status, 200, "same-market India profile lookup should work");

  const tamperedUkBrowse = await api("/api/jobs?country=IN&currency=INR", "GET", posterCookie);
  assert.equal(tamperedUkBrowse.status, 200);
  const tamperedUkBrowseBody = await tamperedUkBrowse.json();
  assert.ok(tamperedUkBrowseBody.jobs.every(job => job.currency === "GBP"),
    "client country/currency query tampering must not change the GB marketplace boundary");
  assert.ok(!tamperedUkBrowseBody.jobs.some(job => job.id === indiaJob.id),
    "GB marketplace listing must not expose an India job");

  const jobsBeforeForgedMarket = await prisma.job.count({ where: { posterId: poster.id } });
  const forgedMarketPost = await api("/api/jobs", "POST", posterCookie, {
    pickup: "CI forged market pickup", dropoff: "CI forged market dropoff",
    jobDate: new Date(Date.now() + 4 * 86_400_000).toISOString().slice(0, 10),
    pickupTime: "10:00", dropoffTime: "14:00",
    pickupTimeZone: "Europe/London", dropoffTimeZone: "Europe/London",
    vehicleType: "Small van (SWB)", price: 100, priceMode: "fixed",
    currency: "INR", country: "IN", crossBorder: false,
  });
  assert.equal(forgedMarketPost.status, 400,
    "GB job creation must reject a client-supplied INR/India market");
  assert.equal(await prisma.job.count({ where: { posterId: poster.id } }), jobsBeforeForgedMarket,
    "rejected market tampering must not create a job");

  const indiaPersonVerification = await api("/api/verification/start", "POST", indiaCookie, {});
  assert.equal(indiaPersonVerification.status, 403,
    "India must not enter the UK person-verification provider flow");
  const indiaCompanyVerification = await api("/api/company-verification", "POST", indiaCookie, {
    companyName: "CI India company", companyNumber: "", isSoleTrader: true,
  });
  assert.equal(indiaCompanyVerification.status, 403,
    "India must not be forced into the UK company-verification workflow");
  const indiaVerificationState = await prisma.account.findUnique({
    where: { id: indiaPoster.id }, select: { verificationStatus: true, companyVerificationStatus: true },
  });
  assert.deepEqual(indiaVerificationState, { verificationStatus: "not_started", companyVerificationStatus: "not_started" },
    "India verification denials must not mutate verification state");

  const notificationReadBefore = await snapshot();
  const outsiderNotifications = await (await api("/api/notifications", "GET", outsiderCookie)).json();
  assert.ok(!outsiderNotifications.notifications.some(item => item.id === notification.id),
    "notification collection must be scoped to the signed-in account");
  const outsiderNotificationRead = await api("/api/notifications/" + notification.id + "/read", "POST", outsiderCookie, {});
  assert.equal(outsiderNotificationRead.status, 404,
    "one account must not mark another account's notification as read");
  assert.deepEqual(await snapshot(), notificationReadBefore,
    "foreign notification access must not change notification or protected lifecycle state");
  const driverNotifications = await (await api("/api/notifications", "GET", driverCookie)).json();
  assert.ok(driverNotifications.notifications.some(item => item.id === notification.id),
    "notification owner must be able to read its notification");

  const posterJobRead = await api("/api/jobs/" + lifecycleJob.id, "GET", posterCookie);
  assert.equal(posterJobRead.status, 200, "poster may read their own job");
  const driverActivityRead = await api("/api/jobs/" + lifecycleJob.id + "/activity", "GET", driverCookie);
  assert.equal(driverActivityRead.status, 200, "assigned driver may read job activity");

  const editResponse = await api("/api/jobs/" + bidJob.id + "/edit", "PATCH", posterCookie, {
    pickup: "Updated CI bid pickup", dropoff: "Updated CI bid dropoff",
    jobDate: new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10),
    pickupTime: "10:00", dropoffTime: "14:00",
    pickupTimeZone: "Europe/London", dropoffTimeZone: "Europe/London",
    vehicleType: "Small van (SWB)", price: 100, priceMode: "bid", currency: "GBP", crossBorder: false,
  });
  if (editResponse.status !== 200) {
    throw new Error("poster should edit their open job (got " + editResponse.status + "): " + await editResponse.text());
  }
  assert.equal((await prisma.job.findUnique({ where: { id: bidJob.id } })).pickup, "Updated CI bid pickup",
    "authorized edit should persist the poster's updated pickup");
  const beforeTamperedEdit = await prisma.job.findUnique({ where: { id: bidJob.id } });
  const forgedMarketEdit = await api("/api/jobs/" + bidJob.id + "/edit", "PATCH", posterCookie, {
    pickup: "Forged edit", dropoff: "CI bid dropoff",
    jobDate: new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10),
    pickupTime: "10:00", dropoffTime: "14:00",
    pickupTimeZone: "Europe/London", dropoffTimeZone: "Europe/London",
    vehicleType: "Small van (SWB)", price: 100, priceMode: "bid",
    currency: "INR", country: "IN", crossBorder: false,
  });
  assert.equal(forgedMarketEdit.status, 400, "job edit must reject forged cross-market currency");
  const afterTamperedEdit = await prisma.job.findUnique({ where: { id: bidJob.id } });
  assert.equal(afterTamperedEdit.currency, beforeTamperedEdit.currency, "rejected edit must preserve the stored currency");
  assert.equal(afterTamperedEdit.pickup, beforeTamperedEdit.pickup, "rejected edit must preserve the stored route");

  const placedBidResponse = await api("/api/jobs/" + bidJob.id + "/bid", "POST", driverCookie, { amount: 95 });
  if (![200, 201].includes(placedBidResponse.status)) {
    throw new Error("eligible authenticated driver should place a bid (got " + placedBidResponse.status + "): " + await placedBidResponse.text());
  }
  const placedBidBody = await placedBidResponse.json();
  assert.ok(placedBidBody.bid?.id, "successful bid response must return the created bid ID");
  bid = { id: placedBidBody.bid.id };
  const posterBidsRead = await api("/api/jobs/" + bidJob.id + "/bids", "GET", posterCookie);
  assert.equal(posterBidsRead.status, 200, "poster may read bids for their own job");

  // Establish that the credentials session is accepted, and the vehicle collection is
  // account-scoped rather than exposing another account's records.
  const ownVehicles = await api("/api/vehicles", "GET", outsiderCookie);
  assert.equal(ownVehicles.status, 200, "active authenticated account should read its vehicle collection");
  const ownVehiclesBody = await ownVehicles.text();
  assert.ok(!ownVehiclesBody.includes(posterVehicle.id), "vehicle collection must not expose another account's vehicle ID");
  assert.ok(!ownVehiclesBody.includes(posterVehicle.regPlate), "vehicle collection must not expose another account's registration");

  const outsiderCases = [
    ["/api/jobs/" + lifecycleJob.id, "GET"],
    ["/api/jobs/" + lifecycleJob.id + "/activity", "GET"],
    ["/api/jobs/" + lifecycleJob.id + "/accept", "POST", {}],
    ["/api/jobs/" + bidJob.id + "/bid", "POST", { amount: 95 }],
    ["/api/jobs/" + bidJob.id + "/bids", "GET"],
    ["/api/jobs/" + bidJob.id + "/bids/" + bid.id + "/accept", "POST", {}],
    ["/api/jobs/" + lifecycleJob.id + "/cancel", "POST", { reason: "fixture" }],
    ["/api/jobs/" + lifecycleJob.id + "/driver-cancel", "POST", { reason: "fixture" }],
    ["/api/jobs/" + lifecycleJob.id + "/confirm-pickup", "POST", {}],
    ["/api/jobs/" + lifecycleJob.id + "/mark-delivered", "POST", {}],
    ["/api/jobs/" + lifecycleJob.id + "/confirm-delivered", "POST", {}],
    ["/api/jobs/" + lifecycleJob.id + "/reject-delivered", "POST", { reason: "fixture" }],
    ["/api/jobs/" + lifecycleJob.id + "/unassign", "POST", {}],
    ["/api/jobs/" + bidJob.id + "/edit", "PATCH", {
      pickup: "Attacker edit", dropoff: "CI bid dropoff",
      jobDate: new Date(Date.now() + 2 * 86_400_000).toISOString().slice(0, 10),
      pickupTime: "10:00", dropoffTime: "14:00", pickupTimeZone: "Europe/London", dropoffTimeZone: "Europe/London",
      vehicleType: "Small van (SWB)", price: 100, priceMode: "bid", currency: "GBP", crossBorder: false,
    }],
    ["/api/jobs/" + lifecycleJob.id + "/payment/mark-paid", "POST", {}],
    ["/api/jobs/" + lifecycleJob.id + "/payment/confirm-received", "POST", {}],
    ["/api/jobs/" + lifecycleJob.id + "/incidents", "GET"],
    ["/api/jobs/" + incidentJob.id + "/incidents", "POST", { description: "Attacker incident", reason: "vehicle_breakdown", requestedOutcome: "terminate_job" }],
    ["/api/jobs/" + lifecycleJob.id + "/incidents/terminate", "POST", { incidentId: incident.id, reason: "vehicle_breakdown", notes: "Attacker termination" }],
    ["/api/jobs/" + lifecycleJob.id + "/incidents/updates", "POST", { incidentId: incident.id, description: "Attacker update" }],
    ["/api/jobs/" + lifecycleJob.id + "/incidents/" + incident.id + "/evidence", "POST", { __formData: true }],
    ["/api/jobs/" + lifecycleJob.id + "/incidents/" + incident.id + "/evidence/" + evidence.id, "GET"],
  ];
  for (const [path, method, body] of outsiderCases) {
    const before = await snapshot();
    const isFormData = body?.__formData === true;
    const anonymous = isFormData
      ? await apiFormData(path, method, null, makeEvidenceForm())
      : await api(path, method, null, body);
    assert.equal(anonymous.status, 401, method + " " + path + ": anonymous HTTP request must return 401");
    assert.deepEqual(await snapshot(), before, method + " " + path + ": anonymous request changed protected state");

    const response = isFormData
      ? await apiFormData(path, method, outsiderCookie, makeEvidenceForm())
      : await api(path, method, outsiderCookie, body);
    assert.ok(denyStatuses.has(response.status),
      method + " " + path + ": unrelated authenticated account must be denied (got " + response.status + ")");
    const after = await snapshot();
    assert.deepEqual(after, before, method + " " + path + ": denied request changed lifecycle/ownership/evidence/vehicle/notification state");
  }

  // A suspended user's existing session must not bypass job-market protection.
  await prisma.account.update({ where: { id: indiaPoster.id }, data: { verificationStatus: "suspended" } });
  const suspendedIndiaJobRead = await api("/api/jobs/" + indiaJob.id, "GET", indiaCookie);
  assert.equal(suspendedIndiaJobRead.status, 403,
    "a pre-existing India session must be denied protected job actions immediately after suspension");
  const suspendedIndiaRating = await api("/api/ratings", "POST", indiaCookie, {
    jobId: indiaJob.id, stars: 5, comment: "must not persist",
  });
  assert.equal(suspendedIndiaRating.status, 403,
    "suspended India account must not submit ratings through the job-market guard");
  await prisma.account.update({ where: { id: indiaPoster.id }, data: { verificationStatus: "not_started" } });

  // An authenticated poster may accept the driver's valid bid; the unrelated
  // account above must not be able to accept that same bid.
  const acceptedBid = await api("/api/jobs/" + bidJob.id + "/bids/" + bid.id + "/accept", "POST", posterCookie, {});
  assert.ok([200, 201].includes(acceptedBid.status),
    "poster should accept the valid driver bid (got " + acceptedBid.status + "): " + await acceptedBid.text());
  const acceptedBidJob = await prisma.job.findUnique({ where: { id: bidJob.id } });
  assert.equal(acceptedBidJob.status, "accepted", "bid acceptance should claim the job");
  assert.equal(acceptedBidJob.acceptedById, driver.id, "bid acceptance should assign the bidding driver");

  const cancelled = await api("/api/jobs/" + cancelJob.id + "/cancel", "POST", posterCookie, {});
  assert.ok([200, 201].includes(cancelled.status), "poster should cancel an open job (got " + cancelled.status + "): " + await cancelled.text());
  assert.equal((await prisma.job.findUnique({ where: { id: cancelJob.id } })).status, "cancelled",
    "authorized poster cancellation should persist cancelled state");

  const acceptedFixed = await api("/api/jobs/" + acceptJob.id + "/accept", "POST", driverCookie, {});
  assert.ok([200, 201].includes(acceptedFixed.status), "eligible driver should accept an open fixed job (got " + acceptedFixed.status + "): " + await acceptedFixed.text());
  let acceptedFixedRow = await prisma.job.findUnique({ where: { id: acceptJob.id } });
  assert.equal(acceptedFixedRow.status, "accepted", "fixed-job acceptance should claim the open job");
  assert.equal(acceptedFixedRow.acceptedById, driver.id, "fixed-job acceptance should assign the authenticated driver");

  const driverBackout = await api("/api/jobs/" + acceptJob.id + "/driver-cancel", "POST", driverCookie, {});
  assert.ok([200, 201].includes(driverBackout.status), "assigned driver should be able to withdraw before pickup (got " + driverBackout.status + "): " + await driverBackout.text());
  assert.equal((await prisma.job.findUnique({ where: { id: acceptJob.id } })).status, "open",
    "driver withdrawal should reopen the job");

  const unassigned = await api("/api/jobs/" + unassignJob.id + "/unassign", "POST", posterCookie, {});
  assert.ok([200, 201].includes(unassigned.status), "poster should unassign a driver before pickup (got " + unassigned.status + "): " + await unassigned.text());
  assert.equal((await prisma.job.findUnique({ where: { id: unassignJob.id } })).status, "open",
    "poster unassignment should reopen the job");

  const rejectedDelivery = await api("/api/jobs/" + rejectJob.id + "/reject-delivered", "POST", posterCookie, {});
  assert.ok([200, 201].includes(rejectedDelivery.status), "poster should reject the driver's delivery marker (got " + rejectedDelivery.status + "): " + await rejectedDelivery.text());
  assert.equal((await prisma.job.findUnique({ where: { id: rejectJob.id } })).status, "in_transit",
    "delivery rejection should return the job to in_transit without erasing the marker");

  const reportedIncidentResponse = await api("/api/jobs/" + incidentJob.id + "/incidents", "POST", posterCookie, {
    reason: "vehicle_breakdown", description: "Isolated CI vehicle breakdown",
    requestedOutcome: "terminate_job", location: "CI fixture route",
  });
  if (reportedIncidentResponse.status !== 201) {
    throw new Error("job party should report an incident (got " + reportedIncidentResponse.status + "): " + await reportedIncidentResponse.text());
  }
  const reportedIncident = (await reportedIncidentResponse.json()).incident;
  assert.ok(reportedIncident?.id, "incident report should return a persistent incident ID");
  const incidentRead = await api("/api/jobs/" + incidentJob.id + "/incidents", "GET", driverCookie);
  assert.equal(incidentRead.status, 200, "assigned driver may read the incident history");

  const incidentUpdate = await api("/api/jobs/" + incidentJob.id + "/incidents/updates", "POST", driverCookie, {
    incidentId: reportedIncident.id, description: "Driver confirms the vehicle breakdown.",
  });
  assert.equal(incidentUpdate.status, 201, "assigned driver may append an incident update");

  const evidenceForm = new FormData();
  evidenceForm.append("file", new Blob(["%PDF-1.4\n% isolated CI evidence\n%%EOF\n"], { type: "application/pdf" }), "ci-evidence.pdf");
  const evidenceUpload = await apiFormData(
    "/api/jobs/" + incidentJob.id + "/incidents/" + reportedIncident.id + "/evidence",
    "POST", posterCookie, evidenceForm,
  );
  if (evidenceUpload.status !== 201) {
    throw new Error("job party should upload incident evidence (got " + evidenceUpload.status + "): " + await evidenceUpload.text());
  }
  const uploadedEvidence = (await evidenceUpload.json()).evidence;
  assert.ok(uploadedEvidence?.id, "evidence upload should return an evidence ID");
  const evidenceDownload = await api(
    "/api/jobs/" + incidentJob.id + "/incidents/" + reportedIncident.id + "/evidence/" + uploadedEvidence.id,
    "GET", driverCookie,
  );
  assert.equal(evidenceDownload.status, 200, "assigned driver may download incident evidence");
  assert.match(evidenceDownload.headers.get("cache-control") || "", /no-store/i, "evidence download must not be cached publicly");
  assert.equal(evidenceDownload.headers.get("x-content-type-options"), "nosniff", "evidence download must disable content sniffing");

  const terminated = await api("/api/jobs/" + incidentJob.id + "/incidents/terminate", "POST", posterCookie, {
    incidentId: reportedIncident.id, reason: "vehicle_breakdown", notes: "Vehicle cannot safely continue.",
  });
  if (terminated.status !== 200) {
    throw new Error("job party should terminate through its incident workflow (got " + terminated.status + "): " + await terminated.text());
  }
  assert.equal((await prisma.job.findUnique({ where: { id: incidentJob.id } })).status, "cancelled",
    "incident termination should cancel the active job while preserving incident history");

  // Exercise the actual authenticated HTTP lifecycle with separate poster and
  // driver JWTs. This stays entirely in the ephemeral CI database.
  const pickup = await api("/api/jobs/" + lifecycleJob.id + "/confirm-pickup", "POST", driverCookie, {});
  assert.ok([200, 201].includes(pickup.status), "assigned driver should confirm pickup (got " + pickup.status + "): " + await pickup.text());
  let current = await prisma.job.findUnique({ where: { id: lifecycleJob.id } });
  assert.equal(current.status, "in_transit", "pickup confirmation should move job to in_transit");

  const marked = await api("/api/jobs/" + lifecycleJob.id + "/mark-delivered", "POST", driverCookie, {});
  assert.ok([200, 201].includes(marked.status), "assigned driver should mark delivery (got " + marked.status + "): " + await marked.text());
  current = await prisma.job.findUnique({ where: { id: lifecycleJob.id } });
  assert.equal(current.status, "delivered", "delivery marker should move job to delivered");
  assert.equal(current.deliveryMarkedById, driver.id, "delivery marker must record the authenticated driver");

  const confirmed = await api("/api/jobs/" + lifecycleJob.id + "/confirm-delivered", "POST", posterCookie, {});
  assert.ok([200, 201].includes(confirmed.status), "poster should confirm delivery (got " + confirmed.status + "): " + await confirmed.text());
  current = await prisma.job.findUnique({ where: { id: lifecycleJob.id } });
  assert.equal(current.status, "completed", "poster confirmation should complete the job");

  const paid = await api("/api/jobs/" + lifecycleJob.id + "/payment/mark-paid", "POST", posterCookie, {});
  assert.ok([200, 201].includes(paid.status), "poster should mark payment paid (got " + paid.status + "): " + await paid.text());
  current = await prisma.job.findUnique({ where: { id: lifecycleJob.id } });
  assert.ok(current.paidMarkedAt, "payment marker should persist paid timestamp");

  const received = await api("/api/jobs/" + lifecycleJob.id + "/payment/confirm-received", "POST", driverCookie, {});
  assert.ok([200, 201].includes(received.status), "assigned driver should confirm receipt (got " + received.status + "): " + await received.text());
  current = await prisma.job.findUnique({ where: { id: lifecycleJob.id } });
  assert.ok(current.receivedConfirmedAt, "receipt confirmation should persist received timestamp");
  assert.equal(current.status, "completed", "payment confirmation must not change completed lifecycle state");

  const validRating = await api("/api/ratings", "POST", driverCookie, {
    jobId: lifecycleJob.id, stars: 5, comment: "CI authenticated rating",
  });
  assert.equal(validRating.status, 200, "matched driver may rate the completed job");
  assert.equal(await prisma.rating.count({ where: { jobId: lifecycleJob.id, raterId: driver.id } }), 1,
    "one rating must be persisted for the matched driver");
  const duplicateRating = await api("/api/ratings", "POST", driverCookie, {
    jobId: lifecycleJob.id, stars: 4, comment: "duplicate",
  });
  assert.equal(duplicateRating.status, 409, "a second rating by the same party must be rejected");
  const ratingBeforeAttacks = await snapshot();
  const outsiderRating = await api("/api/ratings", "POST", outsiderCookie, {
    jobId: lifecycleJob.id, stars: 1, comment: "unrelated account",
  });
  assert.equal(outsiderRating.status, 403, "unrelated GB account must not rate a job");
  const foreignMarketRating = await api("/api/ratings", "POST", indiaCookie, {
    jobId: lifecycleJob.id, stars: 1, comment: "foreign market account",
  });
  assert.equal(foreignMarketRating.status, 403, "India account must not rate a UK job");
  assert.deepEqual(await snapshot(), ratingBeforeAttacks,
    "denied rating attempts must not write ratings or mutate protected state");

  const indiaPayments = await (await api("/api/payments", "GET", indiaCookie)).json();
  assert.ok(!indiaPayments.asPoster.some(job => job.id === lifecycleJob.id) &&
    !indiaPayments.asDriver.some(job => job.id === lifecycleJob.id),
    "India payment view must not expose the UK completed job");
  const ukPayments = await (await api("/api/payments", "GET", posterCookie)).json();
  assert.ok(ukPayments.asPoster.some(job => job.id === lifecycleJob.id),
    "UK poster must see its own completed payment-tracking record");

  // Reuse the same pre-existing session after deletion is requested.
  const deleteAccount = await api("/api/account", "DELETE", outsiderCookie, {
    currentPassword: "ci-e2e-password-reset-12345", confirm: "DELETE",
  });
  assert.equal(deleteAccount.status, 200, "account owner can request deletion and anonymisation");
  const deletedAccount = await prisma.account.findUnique({
    where: { id: outsider.id },
    select: { companyName: true, deletionRequestedAt: true, marketingConsent: true, subscriptionStatus: true, isTester: true },
  });
  const deletedUser = await prisma.user.findUnique({
    where: { id: outsiderUser.id },
    select: { name: true, email: true, phone: true, emailVerifiedAt: true },
  });
  assert.ok(deletedAccount?.deletionRequestedAt);
  assert.equal(deletedAccount.companyName, "Deleted account");
  assert.equal(deletedAccount.marketingConsent, false);
  assert.equal(deletedAccount.subscriptionStatus, "inactive");
  assert.equal(deletedAccount.isTester, false);
  assert.equal(deletedUser.name, "Deleted user");
  assert.match(deletedUser.email, /^deleted\+.*@post2drive\.invalid$/);
  assert.equal(deletedUser.phone, "");
  assert.equal(deletedUser.emailVerifiedAt, null);
  assert.equal(await (await api("/api/auth/session", "GET", outsiderCookie)).text(), "null",
    "account deletion must revoke its pre-existing JWT");
  const deletedGet = await api("/api/vehicles", "GET", outsiderCookie);
  assert.equal(deletedGet.status, 401, "pre-existing JWT must not read vehicles after account deletion");
  const deletedPost = await api("/api/vehicles", "POST", outsiderCookie, {
    vehicleType: "Small van (SWB)", regPlate: "DEL-" + suffix,
  });
  assert.equal(deletedPost.status, 401, "pre-existing JWT must not create vehicles after deletion request");
  assert.equal(await prisma.vehicle.count({ where: { accountId: outsider.id } }), 0,
    "deletion-requested account must not create a vehicle");

  console.log("PASS authenticated lifecycle HTTP E2E in isolated CI DB: 22 existing outsider object-route denials; GB↔IN job/profile/payment boundaries and market-tamper rejection; India phone-only posting; verification exclusion; suspension denial; notification privacy; rating ownership/idempotency; poster/driver pickup→delivery→payment flow; and session revocation.");
} finally {
  if (server) {
    server.kill("SIGTERM");
    await Promise.race([new Promise((resolve) => server.once("exit", resolve)), delay(3000)]);
  }
  if (accountIds.length) {
    await prisma.incidentEvidence.deleteMany({ where: { OR: [{ uploadedById: { in: accountIds } }, { jobId: { in: jobIds } }] } }).catch(() => {});
    await prisma.jobActivity.deleteMany({ where: { OR: [{ actorId: { in: accountIds } }, { jobId: { in: jobIds } }] } }).catch(() => {});
    await prisma.bid.deleteMany({ where: { OR: [{ bidderId: { in: accountIds } }, { jobId: { in: jobIds } }] } }).catch(() => {});
    await prisma.rating.deleteMany({ where: { jobId: { in: jobIds } } }).catch(() => {});
    await prisma.vehicle.deleteMany({ where: { accountId: { in: accountIds } } }).catch(() => {});
    await prisma.notification.deleteMany({ where: { accountId: { in: accountIds } } }).catch(() => {});
    await prisma.job.deleteMany({ where: { OR: [{ id: { in: jobIds } }, { posterId: { in: accountIds } }] } }).catch(() => {});
    await prisma.user.deleteMany({ where: { accountId: { in: accountIds } } }).catch(() => {});
    await prisma.account.deleteMany({ where: { id: { in: accountIds } } }).catch(() => {});
  }
  await prisma.$disconnect();
}
