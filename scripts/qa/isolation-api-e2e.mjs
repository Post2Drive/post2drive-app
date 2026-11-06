#!/usr/bin/env node
// Issue #122: cross-account and cross-market data-isolation matrix over real
// authenticated HTTP. Sibling of lifecycle-api-e2e.mjs and uses the same
// pattern: real NextAuth credential sessions, a production `next start`
// server, and an isolated CI Postgres. Every denial asserts the HTTP status
// AND that every protected row is unchanged afterwards (full-row snapshots).
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { createServer } from "node:net";
import { setTimeout as delay } from "node:timers/promises";
import { createHmac, randomInt, randomUUID } from "node:crypto";
import bcrypt from "bcryptjs";

const { PrismaClient } = process.env.CI === "true"
  ? await import("@prisma/client")
  : await import("./prisma-pg-shim.mjs");
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

const suffix = "iso-" + process.pid + "-" + Date.now();
const PASSWORD = "ci-iso-password-12345";
const SECRET = process.env.NEXTAUTH_SECRET || "ci-only-secret";
const BRIDGE_SECRET = "ci-only-admin-bridge-secret-at-least-32-bytes";
const accountIds = [];
const jobIds = [];
let server;
let serverOutput = "";
let base = "";
let probes = 0;

const FUTURE = (days) => new Date(Date.now() + days * 86_400_000);
const FAR = new Date("2035-12-31T00:00:00.000Z");
const D_401 = [401];
const D_403 = [403];
const D_404 = [404];
const D_AUTHZ = [403, 404];
const D_ANY = [400, 401, 403, 404, 409, 422];

async function snapshot() {
  const a = { in: accountIds };
  const j = { in: jobIds };
  const users = await prisma.user.findMany({ where: { accountId: a }, select: { id: true } });
  const userIds = { in: users.map((u) => u.id) };
  const [
    accounts, usersFull, jobs, bids, activity, evidence, vehicles, notifications, ratings,
    subscriptionPayments, verificationAttempts, verificationFees, driverIdentities, otpChallenges,
    resetTokens, emailTokens, adminAudit, testerCodes, qaRuns, qaAccounts, qaCampaigns, qaSteps,
    referrals, smsCount, accountTotal, userTotal, jobTotal, vehicleTotal,
  ] = await Promise.all([
    prisma.account.findMany({ where: { id: a }, orderBy: { id: "asc" } }),
    prisma.user.findMany({ where: { accountId: a }, orderBy: { id: "asc" } }),
    prisma.job.findMany({ where: { id: j }, orderBy: { id: "asc" } }),
    prisma.bid.findMany({ where: { jobId: j }, orderBy: { id: "asc" } }),
    prisma.jobActivity.findMany({ where: { jobId: j }, orderBy: { id: "asc" } }),
    prisma.incidentEvidence.findMany({ where: { jobId: j }, orderBy: { id: "asc" } }),
    prisma.vehicle.findMany({ where: { accountId: a }, orderBy: { id: "asc" } }),
    prisma.notification.findMany({ where: { accountId: a }, orderBy: { id: "asc" } }),
    prisma.rating.findMany({ where: { jobId: j }, orderBy: { id: "asc" } }),
    prisma.subscriptionPayment.findMany({ where: { accountId: a }, orderBy: { id: "asc" } }),
    prisma.verificationAttempt.findMany({ where: { accountId: a }, orderBy: { id: "asc" } }),
    prisma.verificationFeePayment.findMany({ where: { accountId: a }, orderBy: { id: "asc" } }),
    prisma.driverIdentity.findMany({ where: { accountId: a }, orderBy: { accountId: "asc" } }),
    prisma.phoneOtpChallenge.findMany({ where: { accountId: a }, orderBy: { phoneHash: "asc" } }),
    prisma.passwordResetToken.findMany({ where: { userId: userIds }, orderBy: { id: "asc" } }),
    prisma.emailVerificationToken.findMany({ where: { userId: userIds }, orderBy: { id: "asc" } }),
    prisma.adminAuditEvent.findMany({ orderBy: { id: "asc" } }),
    prisma.testerAccessCode.findMany({ orderBy: { id: "asc" } }),
    prisma.$queryRawUnsafe("SELECT * FROM qa_test_runs ORDER BY id"),
    prisma.$queryRawUnsafe("SELECT * FROM qa_test_accounts ORDER BY run_id,account_id"),
    prisma.$queryRawUnsafe("SELECT * FROM qa_test_campaigns ORDER BY id"),
    prisma.$queryRawUnsafe("SELECT * FROM qa_test_campaign_steps ORDER BY campaign_id,ordinal,id"),
    prisma.referral.findMany({
      where: { OR: [{ referrerId: a }, { referredAccountId: a }] }, orderBy: { id: "asc" },
    }),
    prisma.smsSandboxMessage.count(),
    prisma.account.count(),
    prisma.user.count(),
    prisma.job.count(),
    prisma.vehicle.count(),
  ]);
  return {
    accounts, usersFull, jobs, bids, activity, evidence, vehicles, notifications, ratings,
    subscriptionPayments, verificationAttempts, verificationFees, driverIdentities, otpChallenges,
    resetTokens, emailTokens, adminAudit, testerCodes, qaRuns, qaAccounts, qaCampaigns, qaSteps,
    referrals, smsCount, accountTotal, userTotal, jobTotal, vehicleTotal,
  };
}

const getSetCookies = (response) => {
  if (typeof response.headers.getSetCookie === "function") return response.headers.getSetCookie();
  const single = response.headers.get("set-cookie");
  return single ? [single] : [];
};
async function signIn(email, password = PASSWORD) {
  const csrfResponse = await fetch(base + "/api/auth/csrf", { cache: "no-store", signal: AbortSignal.timeout(8000) });
  assert.equal(csrfResponse.status, 200, "NextAuth CSRF endpoint must be available");
  const csrf = await csrfResponse.json();
  const csrfCookie = getSetCookies(csrfResponse).map((value) => value.split(";")[0]).join("; ");
  const callback = await fetch(base + "/api/auth/callback/credentials", {
    method: "POST",
    headers: {
      cookie: csrfCookie,
      "content-type": "application/x-www-form-urlencoded",
      "x-auth-return-redirect": "true",
      "x-real-ip": "198.51.100.30",
    },
    body: new URLSearchParams({ csrfToken: csrf.csrfToken, callbackUrl: base, email, password }),
    redirect: "manual",
    signal: AbortSignal.timeout(8000),
  });
  const sessionCookies = getSetCookies(callback).filter((value) => /^(?:__Secure-)?next-auth\.session-token=/.test(value));
  if (!sessionCookies.length) {
    throw new Error("Credentials sign-in did not issue a session cookie (HTTP " + callback.status + "): " + (await callback.text()).slice(0, 300));
  }
  return sessionCookies.map((value) => value.split(";")[0]).join("; ");
}
async function api(path, method, cookie, body, extraHeaders = {}) {
  const headers = { ...extraHeaders };
  if (cookie) headers.cookie = cookie;
  if (body !== undefined) headers["content-type"] = "application/json";
  return fetch(base + path, {
    method, headers,
    body: body === undefined ? undefined : JSON.stringify(body),
    cache: "no-store",
    signal: AbortSignal.timeout(10000),
  });
}
const evidenceForm = () => {
  const form = new FormData();
  form.append("file", new Blob(["%PDF-1.4\n% isolation probe\n%%EOF\n"], { type: "application/pdf" }), "probe.pdf");
  return form;
};

// One denial probe: status must be in `allowed`, and nothing protected may change.
async function denied(label, cookie, method, path, body, allowed = D_ANY, opts = {}) {
  const before = await snapshot();
  const response = opts.form
    ? await fetch(base + path, { method, headers: cookie ? { cookie } : {}, body: evidenceForm(), cache: "no-store", signal: AbortSignal.timeout(10000) })
    : await api(path, method, cookie, body, opts.headers);
  const text = await response.text();
  assert.ok(allowed.includes(response.status),
    label + ": " + method + " " + path + " expected " + allowed.join("/") + " but got " + response.status + " " + text.slice(0, 200));
  assert.deepEqual(await snapshot(), before, label + ": " + method + " " + path + " changed protected state");
  probes += 1;
  return { response, text };
}
// A read that must not leak: the body may not contain any forbidden marker.
async function readNoLeak(label, cookie, path, forbidden, expectStatus = 200) {
  const before = await snapshot();
  const response = await api(path, "GET", cookie);
  const text = await response.text();
  assert.equal(response.status, expectStatus, label + ": GET " + path + " got " + response.status + " " + text.slice(0, 200));
  for (const marker of forbidden) {
    assert.ok(!text.includes(marker), label + ": GET " + path + " leaked " + marker);
  }
  assert.deepEqual(await snapshot(), before, label + ": GET " + path + " changed state");
  probes += 1;
  return text;
}

async function makeAccount(kind, data, userData) {
  const account = await prisma.account.create({ data: {
    displayId: kind.toUpperCase() + "-" + suffix, ...data,
  } });
  accountIds.push(account.id);
  const user = await prisma.user.create({ data: {
    accountId: account.id, name: "ISO " + kind,
    email: "iso-" + kind.toLowerCase() + "-" + suffix + "@example.invalid",
    phone: kind.toLowerCase() + "-" + suffix, passwordHash: await bcrypt.hash(PASSWORD, 8),
    emailVerifiedAt: new Date(), ...userData,
  } });
  return { account, user };
}
const activePlan = {
  subscriptionStatus: "active", subscriptionPlanKey: "individual",
  subscriptionStartedAt: new Date(), subscriptionEndsAt: FAR,
};
const baseJob = {
  priceMode: "fixed", vehicleType: "Small van (SWB)", price: 100, crossBorder: false,
  pickupTime: "10:00", dropoffTime: "14:00",
};
const gbJobData = (extra) => ({
  ...baseJob, pickup: "ISO GB pickup", dropoff: "ISO GB dropoff", currency: "GBP",
  pickupTimeZone: "Europe/London", dropoffTimeZone: "Europe/London", ...extra,
});
const inJobData = (extra) => ({
  ...baseJob, pickup: "ISO IN pickup", dropoff: "ISO IN dropoff", currency: "INR",
  pickupTimeZone: "Asia/Kolkata", dropoffTimeZone: "Asia/Kolkata", ...extra,
});
const validGbJobBody = (extra = {}) => ({
  pickup: "ISO tamper pickup", dropoff: "ISO tamper dropoff",
  jobDate: FUTURE(6).toISOString().slice(0, 10), pickupTime: "10:00", dropoffTime: "14:00",
  pickupTimeZone: "Europe/London", dropoffTimeZone: "Europe/London",
  vehicleType: "Small van (SWB)", price: 100, priceMode: "fixed", currency: "GBP", crossBorder: false, ...extra,
});
const validInJobBody = (extra = {}) => ({
  pickup: "ISO IN tamper pickup", dropoff: "ISO IN tamper dropoff",
  jobDate: FUTURE(6).toISOString().slice(0, 10), pickupTime: "10:00", dropoffTime: "14:00",
  pickupTimeZone: "Asia/Kolkata", dropoffTimeZone: "Asia/Kolkata",
  vehicleType: "Small van (SWB)", price: null, priceMode: "fixed", currency: "INR", crossBorder: false, ...extra,
});

try {
  // Fixtures: a poster/driver pair per market, plus a GB outsider with no objects at all.
  const gbPosterF = await makeAccount("GBP", {
    type: "poster", companyName: "ISO GB poster", country: "GB", currency: "GBP",
    phoneVerifiedAt: new Date(), verificationStatus: "verified",
    companyVerificationStatus: "verified", companyVerifiedAt: new Date(), ...activePlan,
  });
  const gbDriverF = await makeAccount("GBD", {
    type: "driver", companyName: "ISO GB driver", country: "GB", currency: "GBP",
    phoneVerifiedAt: new Date(), verificationStatus: "verified", ...activePlan,
  });
  // The outsider has no verified phone, so phone-OTP probes exercise a real unverified path.
  const gbOutsiderF = await makeAccount("GBO", {
    type: "both", companyName: "ISO GB outsider", country: "GB", currency: "GBP",
    verificationStatus: "verified", ...activePlan,
  });
  const inNumber = "9" + String(randomInt(0, 1_000_000_000)).padStart(9, "0");
  const inPosterF = await makeAccount("INP", {
    type: "poster", companyName: "ISO IN poster", country: "IN", currency: "INR",
    phoneVerifiedAt: new Date(), verificationStatus: "not_started", companyVerificationStatus: "not_started",
  });
  const inDriverF = await makeAccount("IND", {
    type: "driver", companyName: "ISO IN driver", country: "IN", currency: "INR",
    phoneVerifiedAt: new Date(), verificationStatus: "not_started",
  }, { phone: "+91" + inNumber, phoneE164: "+91" + inNumber });
  const gbPoster = gbPosterF.account, gbDriver = gbDriverF.account, gbOutsider = gbOutsiderF.account;
  const inPoster = inPosterF.account, inDriver = inDriverF.account;

  const gbDriverVehicle = await prisma.vehicle.create({ data: {
    accountId: gbDriver.id, vehicleType: "Small van (SWB)", regPlate: "ISOG-" + suffix.slice(-8),
    verificationStatus: "verified", verifiedAt: new Date(), motValidUntil: FAR, insuranceValidUntil: FAR,
  } });
  const inDriverVehicle = await prisma.vehicle.create({ data: {
    accountId: inDriver.id, vehicleType: "Motorbike", regPlate: "ISOI-" + suffix.slice(-8),
    verificationStatus: "verified", verifiedAt: new Date(),
  } });

  const gbJob = await prisma.job.create({ data: gbJobData({
    posterId: gbPoster.id, acceptedById: gbDriver.id, status: "accepted", jobDate: FUTURE(1),
  }) });
  const gbBidJob = await prisma.job.create({ data: gbJobData({
    posterId: gbPoster.id, status: "open", priceMode: "bid", jobDate: FUTURE(2),
  }) });
  const gbCompleted = await prisma.job.create({ data: gbJobData({
    posterId: gbPoster.id, acceptedById: gbDriver.id, status: "completed", price: 777, jobDate: FUTURE(3),
  }) });
  const inJob = await prisma.job.create({ data: inJobData({
    posterId: inPoster.id, acceptedById: inDriver.id, status: "accepted", jobDate: FUTURE(1),
  }) });
  const inOpenJob = await prisma.job.create({ data: inJobData({
    posterId: inPoster.id, status: "open", jobDate: FUTURE(2),
  }) });
  const inCompleted = await prisma.job.create({ data: inJobData({
    posterId: inPoster.id, acceptedById: inDriver.id, status: "completed", price: 888, jobDate: FUTURE(3),
  }) });
  jobIds.push(gbJob.id, gbBidJob.id, gbCompleted.id, inJob.id, inOpenJob.id, inCompleted.id);

  const gbBid = await prisma.bid.create({ data: { jobId: gbBidJob.id, bidderId: gbDriver.id, amount: 90 } });
  const mkIncident = async (job, poster) => {
    const incident = await prisma.jobActivity.create({ data: {
      jobId: job.id, actorId: poster.id, action: "INCIDENT_REPORTED",
      description: "isolation incident fixture", metadata: { reason: "vehicle_breakdown" },
    } });
    const evidence = await prisma.incidentEvidence.create({ data: {
      jobId: job.id, incidentId: incident.id, uploadedById: poster.id, fileName: "iso.txt",
      mimeType: "text/plain", sizeBytes: 5, content: Buffer.from("hello"),
      sha256: "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
    } });
    return { incident, evidence };
  };
  const gbInc = await mkIncident(gbJob, gbPoster);
  const inInc = await mkIncident(inJob, inPoster);

  const gbDriverNotif = await prisma.notification.create({ data: {
    accountId: gbDriver.id, type: "job_update", title: "ISO GB notification", body: "private GB", jobId: gbJob.id,
  } });
  const inPosterNotif = await prisma.notification.create({ data: {
    accountId: inPoster.id, type: "job_update", title: "ISO IN notification", body: "private IN", jobId: inJob.id,
  } });
  const gbPending = await prisma.subscriptionPayment.create({ data: {
    accountId: gbPoster.id, planKey: "individual", amountMinorUnits: 1000, currency: "GBP", status: "pending",
  } });

  const port = await getAvailablePort();
  base = "http://127.0.0.1:" + port;
  server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--port", String(port)], {
    env: {
      ...process.env,
      NEXTAUTH_URL: base,
      NEXTAUTH_SECRET: SECRET,
      OPS_DASHBOARD_BRIDGE_SECRET: BRIDGE_SECRET,
      SUBSCRIPTION_WEBHOOK_SECRET: "ci-only-subscription-webhook-secret",
      VERIFICATION_WEBHOOK_SECRET: "ci-only-verification-webhook-secret",
      POST2DRIVE_LICENCE_HASH_SECRET: "ci-only-licence-hash-secret-at-least-32-bytes",
      QA_RUN_TOKEN: "ci-only-qa-run-token-" + suffix,
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

  const gbPosterC = await signIn(gbPosterF.user.email);
  const gbDriverC = await signIn(gbDriverF.user.email);
  const outsiderC = await signIn(gbOutsiderF.user.email);
  const inPosterC = await signIn(inPosterF.user.email);
  const inDriverC = await signIn(inDriverF.user.email);

  // 1. Anonymous callers: every account-scoped route refuses before acting.
  const anonymousRoutes = [
    ["GET", "/api/account"], ["PATCH", "/api/account", { companyName: "anon" }],
    ["DELETE", "/api/account", { confirm: "DELETE", currentPassword: "x" }],
    ["GET", "/api/account/access"], ["GET", "/api/account/waitlist"],
    ["GET", "/api/account/driver-licence"], ["POST", "/api/account/driver-licence", { licenceNumber: "MORGA657054SM9IJ" }],
    ["POST", "/api/account/phone/request", {}], ["POST", "/api/account/phone/verify", { code: "123456" }],
    ["POST", "/api/account/plan/switch-to-poster", {}], ["DELETE", "/api/account/plan/switch-to-poster"],
    ["POST", "/api/company-verification", { companyName: "Anon Ltd" }],
    ["POST", "/api/verification/start", {}], ["POST", "/api/subscription/create-payment", {}],
    ["GET", "/api/vehicles"], ["POST", "/api/vehicles", { vehicleType: "Small van (SWB)", regPlate: "ANON1" }],
    ["PATCH", "/api/vehicles", { vehicleId: gbDriverVehicle.id, insuranceDocumentUrl: "https://attacker.invalid/x" }],
    ["GET", "/api/notifications"], ["POST", "/api/notifications/read-all", {}],
    ["POST", "/api/notifications/" + gbDriverNotif.id + "/read", {}],
    ["GET", "/api/payments"], ["POST", "/api/ratings", { jobId: gbJob.id, stars: 1 }],
    ["GET", "/api/profile/" + gbPoster.displayId], ["GET", "/api/jobs"],
    ["POST", "/api/jobs", validGbJobBody()],
    ["GET", "/api/promotion/status"], ["GET", "/api/promotion/referrals/progress"],
  ];
  for (const [method, path, body] of anonymousRoutes) {
    await denied("anonymous", null, method, path, body, D_401);
  }
  for (const [method, path, body] of [["GET", "/api/pilot/feedback"], ["POST", "/api/pilot/feedback", { title: "x" }]]) {
    await denied("anonymous", null, method, path, body, [401, 404]);
  }

  // 2. Admin and QA routes: non-admin sessions from either market are denied.
  const campaignId = "campaign-" + randomUUID();
  const adminRoutes = [
    ["GET", "/api/admin/company-verification"],
    ["POST", "/api/admin/company-verification", { accountId: gbPoster.id, decision: "verified", notes: "iso probe" }],
    ["POST", "/api/admin/driver-licence/release", { licenceNumber: "MORGA657054SM9IJ", reason: "isolation probe reason" }],
    ["GET", "/api/admin/incidents/resolve"],
    ["POST", "/api/admin/incidents/resolve", { jobId: gbJob.id, incidentId: gbInc.incident.id, outcome: "no_further_action", notes: "iso probe" }],
    ["GET", "/api/admin/qa-campaigns"], ["POST", "/api/admin/qa-campaigns", {}],
    ["DELETE", "/api/admin/qa-campaigns/" + campaignId],
    ["POST", "/api/admin/qa-campaigns/" + campaignId + "/start", { target: "staging", confirm: "RUN_QA_CAMPAIGN_ON_STAGING" }],
    ["GET", "/api/admin/research"],
    ["GET", "/api/admin/testers"], ["POST", "/api/admin/testers", { action: "generate-pilot-codes", count: 1 }],
    ["GET", "/api/admin/vehicles"],
    ["POST", "/api/admin/vehicles", { vehicleId: gbDriverVehicle.id, decision: "verified" }],
    ["POST", "/api/admin/vehicles", { vehicleId: inDriverVehicle.id, decision: "verified" }],
  ];
  for (const [method, path, body] of adminRoutes) {
    await denied("admin anonymous", null, method, path, body, [401, 403]);
    await denied("admin non-admin GB", outsiderC, method, path, body, D_403);
    await denied("admin non-admin IN", inPosterC, method, path, body, D_403);
  }
  // The QA-admin cookie endpoint is same-origin and credential gated, and never sets a cookie on denial.
  await denied("qa-access anonymous", null, "POST", "/api/admin/qa-campaigns/access", { username: "a", password: "b" }, D_401);
  const qaAccessNoOrigin = await denied("qa-access no origin", outsiderC, "POST", "/api/admin/qa-campaigns/access", { username: "a", password: "b" }, D_403);
  assert.equal(qaAccessNoOrigin.response.headers.get("set-cookie"), null, "denied QA-admin login must not set a cookie");
  const qaAccessBadCreds = await denied("qa-access bad creds", outsiderC, "POST", "/api/admin/qa-campaigns/access",
    { username: "admin", password: "wrong" }, [401, 503], { headers: { origin: base } });
  assert.equal(qaAccessBadCreds.response.headers.get("set-cookie"), null, "rejected QA-admin credentials must not set a cookie");
  // /api/qa/run is staging-only: no token, a wrong token, and even the real token are refused here.
  for (const headers of [{}, { authorization: "Bearer wrong-token" }, { authorization: "Bearer ci-only-qa-run-token-" + suffix }]) {
    await denied("qa-run GET", null, "GET", "/api/qa/run", undefined, [401, 403, 404], { headers });
    await denied("qa-run POST", outsiderC, "POST", "/api/qa/run", { action: "cleanup" }, [401, 403, 404], { headers });
  }
  await denied("qa-run report", null, "GET", "/api/qa/run?report=failures&runId=iso", undefined, [401, 403, 404]);

  // 3. Internal bridge and webhooks: no secret, no effect.
  const bridgeBody = JSON.stringify({ action: "unsupported-ci-contract-action", actor: "iso" });
  const bridgeHeaders = (secret) => {
    const ts = String(Date.now()), nonce = randomUUID().replaceAll("-", "");
    return {
      "content-type": "application/json", "x-p2d-admin-timestamp": ts, "x-p2d-admin-nonce": nonce,
      "x-p2d-admin-signature": createHmac("sha256", secret).update(ts + "." + nonce + "." + bridgeBody).digest("hex"),
    };
  };
  for (const [label, headers] of [
    ["no credentials", { "content-type": "application/json" }],
    ["signed with the wrong secret", bridgeHeaders("a-different-secret-that-is-at-least-32-bytes")],
  ]) {
    const before = await snapshot();
    const response = await fetch(base + "/api/internal/admin-bridge", { method: "POST", headers, body: bridgeBody, cache: "no-store" });
    assert.equal(response.status, 401, "bridge " + label + " must be rejected");
    assert.deepEqual(await snapshot(), before, "bridge " + label + " must not change state");
    probes += 1;
  }
  await denied("bridge with a user session only", outsiderC, "POST", "/api/internal/admin-bridge",
    { action: "unsupported-ci-contract-action" }, D_401);
  for (const [path, header] of [
    ["/api/subscription/webhook", "x-post2drive-webhook-secret"],
    ["/api/verification/start/webhook", "x-verification-webhook-secret"],
  ]) {
    const forged = { paymentId: gbPending.id, provider: "attacker", providerPaymentId: "forged", status: "paid", accountId: gbOutsider.id };
    await denied("webhook no secret", null, "POST", path, forged, D_401);
    await denied("webhook wrong secret", null, "POST", path, forged, D_401, { headers: { [header]: "wrong-secret" } });
    await denied("webhook user session only", outsiderC, "POST", path, forged, D_401);
  }

  // 4. Vehicles: PATCH by id (there is no per-id GET/DELETE route), POST and list.
  const vehicleAttack = { vehicleId: gbDriverVehicle.id, insuranceDocumentUrl: "https://attacker.invalid/insurance", registeredKeeperName: "Attacker" };
  await denied("vehicle patch same-market outsider", outsiderC, "PATCH", "/api/vehicles", vehicleAttack, D_404);
  await denied("vehicle patch same-market poster", gbPosterC, "PATCH", "/api/vehicles", vehicleAttack, D_404);
  await denied("vehicle patch IN -> GB", inDriverC, "PATCH", "/api/vehicles", vehicleAttack, D_404);
  await denied("vehicle patch GB -> IN", gbDriverC, "PATCH", "/api/vehicles",
    { ...vehicleAttack, vehicleId: inDriverVehicle.id }, D_404);
  await denied("vehicle patch forged owner", gbDriverC, "PATCH", "/api/vehicles",
    { vehicleId: inDriverVehicle.id, accountId: gbDriver.id, country: "GB", currency: "GBP", registeredKeeperName: "x" }, D_404);
  await denied("vehicle post by poster-type account", gbPosterC, "POST", "/api/vehicles",
    { vehicleType: "Small van (SWB)", regPlate: "ISOP1", ownershipType: "owned", accountId: gbDriver.id }, D_403);
  await denied("vehicle post IN with GB jurisdiction", inDriverC, "POST", "/api/vehicles",
    { vehicleType: "Small van (SWB)", regPlate: "ISOIN2", registrationRegion: "ENGLAND", ownershipType: "owned" }, [400, 403]);
  // A forged owner/market on a valid registration is ignored: the row lands on the caller only.
  {
    const before = await snapshot();
    const forged = await api("/api/vehicles", "POST", gbDriverC, {
      vehicleType: "Small van (SWB)", regPlate: "ISOFORGED" + suffix.slice(-5), ownershipType: "owned",
      motValidUntil: FAR.toISOString().slice(0, 10), insuranceValidUntil: FAR.toISOString().slice(0, 10),
      accountId: inDriver.id, country: "IN", currency: "INR", verificationStatus: "verified",
    });
    assert.ok([201, 400, 403].includes(forged.status), "forged-owner vehicle create got " + forged.status);
    const after = await snapshot();
    assert.equal(after.vehicleTotal - before.vehicleTotal, forged.status === 201 ? 1 : 0);
    assert.deepEqual(after.vehicles.filter((v) => v.accountId === inDriver.id), before.vehicles.filter((v) => v.accountId === inDriver.id),
      "forged accountId must not add or change a vehicle on the named account");
    assert.deepEqual(after.accounts, before.accounts, "forged market fields must not change any account");
    if (forged.status === 201) {
      const created = after.vehicles.find((v) => !before.vehicles.some((b) => b.id === v.id));
      assert.equal(created.accountId, gbDriver.id, "created vehicle must belong to the caller");
      assert.equal(created.verificationStatus, "pending", "client may not self-verify a vehicle");
    }
    probes += 1;
  }
  const inVehicleList = await readNoLeak("vehicle list IN", inDriverC, "/api/vehicles", [gbDriverVehicle.id, gbDriverVehicle.regPlate]);
  assert.ok(inVehicleList.includes(inDriverVehicle.id), "positive control: IN driver sees its own vehicle");
  await readNoLeak("vehicle list GB", gbDriverC, "/api/vehicles", [inDriverVehicle.id, inDriverVehicle.regPlate]);
  await readNoLeak("vehicle list outsider", outsiderC, "/api/vehicles", [gbDriverVehicle.id, inDriverVehicle.id]);

  // 5. Notifications and read-state.
  await denied("notification read same-market outsider", outsiderC, "POST", "/api/notifications/" + gbDriverNotif.id + "/read", {}, D_404);
  await denied("notification read IN -> GB", inPosterC, "POST", "/api/notifications/" + gbDriverNotif.id + "/read", {}, D_404);
  await denied("notification read GB -> IN", gbDriverC, "POST", "/api/notifications/" + inPosterNotif.id + "/read", {}, D_404);
  // These callers own no notifications, so read-all may only change rows if it reaches other accounts.
  await denied("notifications read-all GB outsider", outsiderC, "POST", "/api/notifications/read-all", {}, [200]);
  await denied("notifications read-all IN driver", inDriverC, "POST", "/api/notifications/read-all", {}, [200]);
  await readNoLeak("notification list GB outsider", outsiderC, "/api/notifications", [gbDriverNotif.id, inPosterNotif.id]);
  await readNoLeak("notification list IN poster", inPosterC, "/api/notifications", [gbDriverNotif.id, "ISO GB notification"]);
  await readNoLeak("notification list GB driver", gbDriverC, "/api/notifications", [inPosterNotif.id, "ISO IN notification"]);

  // 6. Payments.
  const gbPayments = await readNoLeak("payments GB poster", gbPosterC, "/api/payments", [inCompleted.id]);
  assert.ok(gbPayments.includes(gbCompleted.id), "positive control: GB poster sees its own completed job");
  const inPayments = await readNoLeak("payments IN poster", inPosterC, "/api/payments", [gbCompleted.id]);
  assert.ok(inPayments.includes(inCompleted.id), "positive control: IN poster sees its own completed job");
  await readNoLeak("payments GB outsider", outsiderC, "/api/payments", [gbCompleted.id, inCompleted.id]);
  await readNoLeak("payments IN driver", inDriverC, "/api/payments", [gbCompleted.id]);
  await readNoLeak("payments GB driver", gbDriverC, "/api/payments", [inCompleted.id]);
  await readNoLeak("payments query tampering", outsiderC, "/api/payments?accountId=" + gbPoster.id + "&country=GB&currency=GBP", [gbCompleted.id, inCompleted.id]);
  await denied("payments write method", gbPosterC, "POST", "/api/payments", {}, [404, 405]);
  // Subscription payments: IN is not a paid market; the body never chooses account, currency or amount.
  await denied("create-payment IN poster", inPosterC, "POST", "/api/subscription/create-payment",
    { accountId: gbPoster.id, currency: "GBP", amountMinorUnits: 1, planKey: "fleet" }, [400, 403]);
  {
    const before = await snapshot();
    const response = await api("/api/subscription/create-payment", "POST", gbDriverC,
      { accountId: gbPoster.id, currency: "INR", amountMinorUnits: 1, planKey: "fleet" });
    assert.ok([200, 400, 403].includes(response.status), "forged create-payment got " + response.status);
    const after = await snapshot();
    const fresh = after.subscriptionPayments.filter((p) => !before.subscriptionPayments.some((b) => b.id === p.id));
    for (const payment of fresh) {
      assert.equal(payment.accountId, gbDriver.id, "payment must be created for the caller only");
      assert.equal(payment.currency, "GBP", "payment currency comes from the account, not the body");
      assert.notEqual(payment.amountMinorUnits, 1, "payment amount comes from the server price list");
    }
    assert.deepEqual(after.subscriptionPayments.filter((p) => p.accountId !== gbDriver.id),
      before.subscriptionPayments.filter((p) => p.accountId !== gbDriver.id), "other accounts' payments must not change");
    assert.deepEqual(after.accounts, before.accounts, "forged create-payment must not change any account");
    probes += 1;
  }

  // 7. Ratings.
  await denied("rating same-market outsider", outsiderC, "POST", "/api/ratings", { jobId: gbJob.id, stars: 1, comment: "attacker" }, D_AUTHZ);
  await denied("rating IN driver on GB job", inDriverC, "POST", "/api/ratings", { jobId: gbJob.id, stars: 1, comment: "attacker" }, D_AUTHZ);
  await denied("rating GB driver on IN job", gbDriverC, "POST", "/api/ratings", { jobId: inJob.id, stars: 1, comment: "attacker" }, D_AUTHZ);
  await denied("rating IN poster on GB completed job", inPosterC, "POST", "/api/ratings", { jobId: gbCompleted.id, stars: 5 }, D_AUTHZ);
  await denied("rating GB poster on IN completed job", gbPosterC, "POST", "/api/ratings", { jobId: inCompleted.id, stars: 5 }, D_AUTHZ);
  await denied("rating forged rater/ratee", outsiderC, "POST", "/api/ratings",
    { jobId: gbCompleted.id, stars: 1, raterId: gbPoster.id, rateeId: gbDriver.id, visibleAfter: new Date().toISOString() }, D_AUTHZ);

  // 8. Bids.
  await denied("bid IN driver on GB job", inDriverC, "POST", "/api/jobs/" + gbBidJob.id + "/bid", { amount: 50 }, D_AUTHZ);
  await denied("bid GB driver on IN job", gbDriverC, "POST", "/api/jobs/" + inOpenJob.id + "/bid", { amount: 50 }, D_AUTHZ);
  await denied("bid list IN poster on GB job", inPosterC, "GET", "/api/jobs/" + gbBidJob.id + "/bids", undefined, D_AUTHZ);
  await denied("bid accept IN poster on real GB bid", inPosterC, "POST", "/api/jobs/" + gbBidJob.id + "/bids/" + gbBid.id + "/accept", {}, D_AUTHZ);
  await denied("bid accept same-market outsider on real bid", outsiderC, "POST", "/api/jobs/" + gbBidJob.id + "/bids/" + gbBid.id + "/accept", {}, D_AUTHZ);
  await denied("bid accept via a different job id", gbPosterC, "POST", "/api/jobs/" + inOpenJob.id + "/bids/" + gbBid.id + "/accept", {}, D_AUTHZ);
  await denied("bid accept real bid under the wrong own job", gbPosterC, "POST", "/api/jobs/" + gbJob.id + "/bids/" + gbBid.id + "/accept", {}, D_ANY);

  // 9. Incidents and evidence with real ids, both directions.
  const evPath = (job, inc, withEvidence) => "/api/jobs/" + job.id + "/incidents/" + inc.incident.id + "/evidence" + (withEvidence ? "/" + inc.evidence.id : "");
  for (const [label, cookie, job, inc] of [
    ["IN poster -> GB incident", inPosterC, gbJob, gbInc],
    ["IN driver -> GB incident", inDriverC, gbJob, gbInc],
    ["GB poster -> IN incident", gbPosterC, inJob, inInc],
    ["GB driver -> IN incident", gbDriverC, inJob, inInc],
    ["GB outsider -> GB incident", outsiderC, gbJob, gbInc],
    ["GB outsider -> IN incident", outsiderC, inJob, inInc],
  ]) {
    await denied(label + " evidence download", cookie, "GET", evPath(job, inc, true), undefined, D_AUTHZ);
    await denied(label + " evidence upload", cookie, "POST", evPath(job, inc, false), undefined, D_AUTHZ, { form: true });
    await denied(label + " incident list", cookie, "GET", "/api/jobs/" + job.id + "/incidents", undefined, D_AUTHZ);
    await denied(label + " incident create", cookie, "POST", "/api/jobs/" + job.id + "/incidents",
      { description: "attacker incident", reason: "vehicle_breakdown", requestedOutcome: "terminate_job" }, D_AUTHZ);
    await denied(label + " incident update", cookie, "POST", "/api/jobs/" + job.id + "/incidents/updates",
      { incidentId: inc.incident.id, description: "attacker update" }, D_AUTHZ);
    await denied(label + " incident terminate", cookie, "POST", "/api/jobs/" + job.id + "/incidents/terminate",
      { incidentId: inc.incident.id, reason: "vehicle_breakdown", notes: "attacker" }, D_AUTHZ);
  }
  // Evidence and incident ids are bound to their own job: mixing real ids across jobs is refused.
  await denied("evidence id from another job", gbPosterC, "GET",
    "/api/jobs/" + gbJob.id + "/incidents/" + gbInc.incident.id + "/evidence/" + inInc.evidence.id, undefined, D_AUTHZ);
  await denied("incident id from another job", inPosterC, "GET",
    "/api/jobs/" + inJob.id + "/incidents/" + gbInc.incident.id + "/evidence/" + gbInc.evidence.id, undefined, D_AUTHZ);

  // 10. Profiles.
  await readNoLeak("profile GB -> IN", gbPosterC, "/api/profile/" + inPoster.displayId, [inPoster.id, inPosterF.user.email], 404);
  await readNoLeak("profile IN -> GB", inPosterC, "/api/profile/" + gbPoster.displayId, [gbPoster.id, gbPosterF.user.email], 404);
  await readNoLeak("profile IN driver -> GB driver", inDriverC, "/api/profile/" + gbDriver.displayId, [gbDriver.id], 404);
  await readNoLeak("profile missing", gbPosterC, "/api/profile/NOPE-" + suffix, [], 404);
  await readNoLeak("profile same-market outsider", outsiderC, "/api/profile/" + gbPoster.displayId,
    [gbPosterF.user.email, gbPosterF.user.phone, gbPosterF.user.passwordHash, gbPosterF.user.id]);
  await denied("profile PATCH", gbPosterC, "PATCH", "/api/profile/" + gbPoster.displayId, { companyName: "x" }, [404, 405]);
  await denied("profile DELETE", outsiderC, "DELETE", "/api/profile/" + gbPoster.displayId, undefined, [404, 405]);

  // 11. Job create/edit tamper: market, currency, owner and state are not client-controlled.
  const jobsBeforeTamper = await prisma.job.count({ where: { posterId: { in: accountIds } } });
  await denied("GB create with INR", gbPosterC, "POST", "/api/jobs", validGbJobBody({ currency: "INR", country: "IN" }), [400]);
  await denied("GB create with EUR", gbPosterC, "POST", "/api/jobs", validGbJobBody({ currency: "EUR" }), [400]);
  await denied("IN create with GBP", inPosterC, "POST", "/api/jobs", validInJobBody({ currency: "GBP", country: "GB" }), [400]);
  assert.equal(await prisma.job.count({ where: { posterId: { in: accountIds } } }), jobsBeforeTamper, "tampered creates must not add jobs");
  for (const [label, cookie, poster, body, currency, accepted] of [
    ["GB", gbPosterC, gbPoster, validGbJobBody({ posterId: inPoster.id, acceptedById: gbOutsider.id, status: "completed", country: "IN", paidMarkedAt: new Date().toISOString(), id: "forged-job-id" }), "GBP", [201, 402, 403]],
    ["IN", inPosterC, inPoster, validInJobBody({ posterId: gbPoster.id, acceptedById: gbOutsider.id, status: "completed", country: "GB", id: "forged-job-id" }), "INR", [201]],
  ]) {
    const before = await snapshot();
    const response = await api("/api/jobs", "POST", cookie, body);
    const text = await response.text();
    assert.ok(accepted.includes(response.status), label + " create with ignorable forged fields: " + response.status + " " + text.slice(0, 200));
    const after = await snapshot();
    if (response.status === 201) {
      const created = JSON.parse(text).job;
      jobIds.push(created.id);
      const row = await prisma.job.findUnique({ where: { id: created.id } });
      assert.notEqual(row.id, "forged-job-id", label + " client may not choose the job id");
      assert.equal(row.posterId, poster.id, label + " job belongs to the caller, not the forged posterId");
      assert.equal(row.acceptedById, null, label + " client may not pre-assign a driver");
      assert.equal(row.status, "open", label + " client may not set job status");
      assert.equal(row.currency, currency, label + " currency comes from the account");
      assert.equal(row.paidMarkedAt, null, label + " client may not set payment state");
      assert.equal(after.jobTotal - before.jobTotal, 1, label + " create adds exactly one job");
    } else {
      assert.equal(after.jobTotal, before.jobTotal, label + " refused create must not add a job");
    }
    assert.deepEqual(after.accounts, before.accounts, label + " create must not change any account");
    probes += 1;
  }
  const editBody = (extra) => ({
    pickup: "Forged", dropoff: "Forged", jobDate: FUTURE(8).toISOString().slice(0, 10),
    pickupTime: "10:00", dropoffTime: "14:00", pickupTimeZone: "Europe/London", dropoffTimeZone: "Europe/London",
    vehicleType: "Small van (SWB)", price: 1, priceMode: "fixed", currency: "GBP", crossBorder: false, ...extra,
  });
  await denied("edit GB job as outsider with forged owner", outsiderC, "PATCH", "/api/jobs/" + gbBidJob.id + "/edit",
    editBody({ posterId: gbOutsider.id, status: "completed" }), [400, 403, 404]);
  await denied("edit IN job as GB poster", gbPosterC, "PATCH", "/api/jobs/" + inOpenJob.id + "/edit", editBody({ currency: "INR" }), [400, 403, 404]);
  await denied("edit GB job as IN poster", inPosterC, "PATCH", "/api/jobs/" + gbBidJob.id + "/edit", editBody({ currency: "GBP" }), [400, 403, 404]);
  await denied("edit own GB job to INR", gbPosterC, "PATCH", "/api/jobs/" + gbBidJob.id + "/edit", editBody({ currency: "INR", country: "IN", priceMode: "bid" }), [400]);
  await denied("edit own IN job to GBP", inPosterC, "PATCH", "/api/jobs/" + inOpenJob.id + "/edit",
    editBody({ currency: "GBP", pickupTimeZone: "Asia/Kolkata", dropoffTimeZone: "Asia/Kolkata" }), [400]);

  // 12. Account settings (/api/account*).
  await denied("settings market switch GB->IN", gbPosterC, "PATCH", "/api/account", { country: "IN", currency: "INR" }, [409]);
  await denied("settings market switch IN->GB", inPosterC, "PATCH", "/api/account", { country: "GB", currency: "GBP" }, [409]);
  await denied("settings currency only", gbPosterC, "PATCH", "/api/account", { currency: "INR" }, [409]);
  await denied("settings country only", inPosterC, "PATCH", "/api/account", { country: "GB" }, [409]);
  await denied("settings wrong current password", outsiderC, "PATCH", "/api/account", { currentPassword: "not-the-password", newPassword: "attacker-password-1" }, [403]);
  await denied("settings new password without current", outsiderC, "PATCH", "/api/account", { newPassword: "attacker-password-1" }, [400]);
  await denied("settings delete without confirm", outsiderC, "DELETE", "/api/account", { accountId: gbPoster.id, currentPassword: PASSWORD }, [400]);
  await denied("settings delete with wrong password", outsiderC, "DELETE", "/api/account", { accountId: gbPoster.id, confirm: "DELETE", currentPassword: "wrong-password" }, [403]);
  await denied("settings oversize field", outsiderC, "PATCH", "/api/account", { name: "x".repeat(500) }, [400]);
  const accountRead = await readNoLeak("settings read", outsiderC, "/api/account?accountId=" + gbPoster.id,
    [gbPoster.id, gbPosterF.user.email, gbPosterF.user.passwordHash]);
  assert.equal(JSON.parse(accountRead).account.id, gbOutsider.id, "account read must return the session's account");
  await readNoLeak("access read", outsiderC, "/api/account/access?accountId=" + gbPoster.id, [gbPoster.id]);
  await readNoLeak("promotion status", outsiderC, "/api/promotion/status?accountId=" + gbPoster.id, [gbPoster.id]);
  await readNoLeak("promotion referrals", outsiderC, "/api/promotion/referrals/progress?accountId=" + gbPoster.id, [gbPoster.id]);
  {
    // The waitlist read may legitimately record the caller's own queue position; nobody else's row may change.
    const before = await snapshot();
    const response = await api("/api/account/waitlist?accountId=" + gbPoster.id, "GET", outsiderC);
    const text = await response.text();
    assert.equal(response.status, 200, "waitlist read: " + response.status + " " + text.slice(0, 200));
    assert.ok(!text.includes(gbPoster.id), "waitlist read leaked another account id");
    const after = await snapshot();
    assert.deepEqual(after.accounts.filter((a) => a.id !== gbOutsider.id), before.accounts.filter((a) => a.id !== gbOutsider.id));
    assert.deepEqual({ ...after, accounts: null }, { ...before, accounts: null }, "waitlist read may only touch the caller's account row");
    probes += 1;
  }
  await denied("plan switch cancel with nothing pending", gbPosterC, "DELETE", "/api/account/plan/switch-to-poster", undefined, [200]);
  await denied("licence record by poster-type account", gbPosterC, "POST", "/api/account/driver-licence", { accountId: gbDriver.id, licenceNumber: "MORGA657054SM9IJ" }, D_403);
  await denied("licence record by unverified IN driver", inDriverC, "POST", "/api/account/driver-licence", { licenceNumber: "MORGA657054SM9IJ" }, D_403);
  const licenceRead = await readNoLeak("licence read", outsiderC, "/api/account/driver-licence?accountId=" + gbDriver.id, [gbDriver.id]);
  assert.equal(JSON.parse(licenceRead).recorded, false);

  // 13. Verification routes.
  await denied("person verification, IN poster", inPosterC, "POST", "/api/verification/start", { accountId: gbPoster.id, country: "GB" }, D_403);
  await denied("person verification, IN driver", inDriverC, "POST", "/api/verification/start", {}, D_403);
  await denied("company verification, IN account", inPosterC, "POST", "/api/company-verification",
    { companyName: "Forged Ltd", companyNumber: "12345678", country: "GB", currency: "GBP" }, D_403);
  await denied("company verification, unverified phone", outsiderC, "POST", "/api/company-verification",
    { companyName: "Forged Ltd", responsibleUserId: gbPosterF.user.id, accountId: gbPoster.id }, [409]);
  await denied("company verification, foreign responsible user", gbPosterC, "POST", "/api/company-verification",
    { companyName: "Forged Ltd", responsibleUserId: gbDriverF.user.id }, D_ANY);
  for (const token of ["not-a-token", "a".repeat(64)]) {
    await denied("email verify bad token", null, "POST", "/api/email/verify", { token }, [400]);
  }
  await denied("email resend, existing user", null, "POST", "/api/email/verification/resend", { email: gbPosterF.user.email }, [200, 409, 503]);
  await denied("email resend, unknown address", null, "POST", "/api/email/verification/resend", { email: "nobody-" + suffix + "@example.invalid" }, [200, 409, 503]);

  // 14. Phone verification (/api/account/phone/*) and public India phone OTP.
  await denied("phone request ignores client phone", outsiderC, "POST", "/api/account/phone/request",
    { phone: "+91" + inNumber, accountId: inDriver.id }, [400, 503]);
  await denied("phone verify ignores client account", outsiderC, "POST", "/api/account/phone/verify",
    { code: "000000", phone: "+91" + inNumber, accountId: inDriver.id }, [400, 503]);
  await denied("phone verify on an already verified account", inPosterC, "POST", "/api/account/phone/verify", { code: "000000" }, [200]);
  await denied("public OTP request, non-Indian number", null, "POST", "/api/phone-otp/request", { phone: "+447700900123" }, [200, 400, 503]);
  await denied("public OTP reset with a guessed code", null, "POST", "/api/phone-otp/reset",
    { phone: "+91" + inNumber, code: "123456", password: "attacker-password-123" }, [400]);
  await denied("public OTP reset, non-Indian number", null, "POST", "/api/phone-otp/reset",
    { phone: "+447700900123", code: "123456", password: "attacker-password-123" }, [400]);
  await signIn(inDriverF.user.email); // the original password still works

  // 15. Signup: market and currency must match; tester codes are GB-only; no user is created.
  const signupMarker = "ISO Signup " + suffix;
  for (const [label, extra] of [
    ["GB with INR", { country: "GB", currency: "INR", email: "iso-signup-1-" + suffix + "@example.invalid" }],
    ["IN with GBP", { country: "IN", currency: "GBP" }],
    ["IN with a tester code", { country: "IN", currency: "INR", testerCode: "P2D-UKQA-AAAA-BBBB" }],
  ]) {
    await denied("signup " + label, null, "POST", "/api/signup", {
      name: signupMarker, phone: "07700900" + String(randomInt(100, 999)), password: PASSWORD, companyName: "ISO Co",
      type: "driver", termsAccepted: true, termsVersion: "1", isTester: true, subscriptionStatus: "active", ...extra,
    }, [400]);
  }
  assert.equal(await prisma.user.count({ where: { name: signupMarker } }), 0, "rejected signups must not create users");

  // 16. Last: privileged fields on a successful settings update are ignored; only the allowed field changes.
  {
    const before = await snapshot();
    const response = await api("/api/account", "PATCH", outsiderC, {
      companyName: "ISO renamed", accountId: gbPoster.id, userId: gbPosterF.user.id, id: gbPoster.id,
      type: "poster", isTester: true, testerApprovalStatus: "approved", verificationStatus: "suspended",
      subscriptionStatus: "promotional", subscriptionPlanKey: "fleet", phoneVerifiedAt: new Date().toISOString(),
      companyVerificationStatus: "verified", planType: "fleet", fleetVehicleCount: 999,
    });
    assert.equal(response.status, 200, "settings update with forged fields: " + response.status + " " + await response.text());
    const after = await snapshot();
    const strip = ({ companyName, updatedAt, ...rest }) => rest;
    assert.deepEqual(after.accounts.filter((a) => a.id !== gbOutsider.id), before.accounts.filter((a) => a.id !== gbOutsider.id),
      "forged settings fields must not change any other account");
    assert.deepEqual(after.accounts.filter((a) => a.id === gbOutsider.id).map(strip), before.accounts.filter((a) => a.id === gbOutsider.id).map(strip),
      "forged privilege fields must not change the caller's own protected columns");
    assert.deepEqual(after.usersFull, before.usersFull, "forged settings fields must not change any user");
    assert.equal(after.accounts.find((a) => a.id === gbOutsider.id).companyName, "ISO renamed", "positive control: allowed field applied");
    probes += 1;
  }

  console.log("Isolation matrix (#122): " + probes + " probes passed; every denial left all protected rows unchanged.");
} finally {
  if (server) {
    server.kill("SIGTERM");
    await Promise.race([new Promise((resolve) => server.once("exit", resolve)), delay(3000)]);
  }
  if (accountIds.length) {
    const users = await prisma.user.findMany({ where: { accountId: { in: accountIds } }, select: { id: true } }).catch(() => []);
    const userIds = users.map((u) => u.id);
    await prisma.incidentEvidence.deleteMany({ where: { OR: [{ uploadedById: { in: accountIds } }, { jobId: { in: jobIds } }] } }).catch(() => {});
    await prisma.jobActivity.deleteMany({ where: { OR: [{ actorId: { in: accountIds } }, { jobId: { in: jobIds } }] } }).catch(() => {});
    await prisma.bid.deleteMany({ where: { OR: [{ bidderId: { in: accountIds } }, { jobId: { in: jobIds } }] } }).catch(() => {});
    await prisma.rating.deleteMany({ where: { jobId: { in: jobIds } } }).catch(() => {});
    await prisma.vehicle.deleteMany({ where: { accountId: { in: accountIds } } }).catch(() => {});
    await prisma.notification.deleteMany({ where: { accountId: { in: accountIds } } }).catch(() => {});
    await prisma.subscriptionPayment.deleteMany({ where: { accountId: { in: accountIds } } }).catch(() => {});
    await prisma.verificationFeePayment.deleteMany({ where: { accountId: { in: accountIds } } }).catch(() => {});
    await prisma.phoneOtpChallenge.deleteMany({ where: { accountId: { in: accountIds } } }).catch(() => {});
    await prisma.passwordResetToken.deleteMany({ where: { userId: { in: userIds } } }).catch(() => {});
    await prisma.emailVerificationToken.deleteMany({ where: { userId: { in: userIds } } }).catch(() => {});
    await prisma.job.deleteMany({ where: { OR: [{ id: { in: jobIds } }, { posterId: { in: accountIds } }] } }).catch(() => {});
    await prisma.user.deleteMany({ where: { accountId: { in: accountIds } } }).catch(() => {});
    await prisma.account.deleteMany({ where: { id: { in: accountIds } } }).catch(() => {});
  }
  await prisma.$disconnect();
}
