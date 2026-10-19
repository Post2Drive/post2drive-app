#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { PrismaClient } from "@prisma/client";
import { encode } from "next-auth/jwt";

const prisma = new PrismaClient();
const suffix = process.pid + "-" + Date.now();
const accountIds = [];
const jobIds = [];
let server;
let serverOutput = "";
let base = "";
let poster, driver, outsider, lifecycleJob, bidJob, bid, incident, evidence, posterVehicle, driverVehicle;

async function snapshot() {
  const [jobRows, bidCount, activityCount, evidenceCount, vehicleCount, notificationCount] = await Promise.all([
    prisma.job.findMany({
      where: { id: { in: jobIds } },
      select: { id: true, posterId: true, acceptedById: true, status: true, priceMode: true, deliveryMarkedById: true, paidMarkedAt: true, receivedConfirmedAt: true },
    }),
    prisma.bid.count({ where: { jobId: { in: jobIds } } }),
    prisma.jobActivity.count({ where: { jobId: { in: jobIds } } }),
    prisma.incidentEvidence.count({ where: { jobId: { in: jobIds } } }),
    prisma.vehicle.count({ where: { accountId: { in: accountIds } } }),
    prisma.notification.count({ where: { accountId: { in: accountIds } } }),
  ]);
  return { jobRows, bidCount, activityCount, evidenceCount, vehicleCount, notificationCount };
}
async function makeCookie(accountId) {
  const token = await encode({
    token: { sub: accountId, accountId, accountDeleted: false, email: accountId + "@example.invalid" },
    secret: process.env.NEXTAUTH_SECRET,
    maxAge: 3600,
    salt: "next-auth.session-token",
  });
  return "next-auth.session-token=" + token;
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
const denyStatuses = new Set([400, 401, 403, 404, 409, 422]);
try {
  poster = await prisma.account.create({ data: {
    type: "poster", companyName: "CI lifecycle poster", displayId: "CIP-" + suffix,
    country: "GB", currency: "GBP", verificationStatus: "verified",
  }});
  driver = await prisma.account.create({ data: {
    type: "driver", companyName: "CI lifecycle driver", displayId: "CID-" + suffix,
    country: "GB", currency: "GBP", verificationStatus: "verified",
  }});
  outsider = await prisma.account.create({ data: {
    type: "both", companyName: "CI unrelated account", displayId: "CIO-" + suffix,
    country: "GB", currency: "GBP", verificationStatus: "verified",
  }});
  accountIds.push(poster.id, driver.id, outsider.id);

  lifecycleJob = await prisma.job.create({ data: {
    posterId: poster.id, acceptedById: driver.id, status: "accepted", priceMode: "fixed",
    pickup: "CI fixture pickup", dropoff: "CI fixture dropoff",
    jobDate: new Date(Date.now() + 86_400_000), pickupTime: "10:00", dropoffTime: "14:00",
    pickupTimeZone: "Europe/London", dropoffTimeZone: "Europe/London",
    vehicleType: "van", price: 100, currency: "GBP", crossBorder: false,
  }});
  bidJob = await prisma.job.create({ data: {
    posterId: poster.id, status: "open", priceMode: "bid",
    pickup: "CI bid pickup", dropoff: "CI bid dropoff",
    jobDate: new Date(Date.now() + 172_800_000), pickupTime: "10:00", dropoffTime: "14:00",
    pickupTimeZone: "Europe/London", dropoffTimeZone: "Europe/London",
    vehicleType: "van", price: 100, currency: "GBP", crossBorder: false,
  }});
  jobIds.push(lifecycleJob.id, bidJob.id);
  incident = await prisma.jobActivity.create({ data: {
    jobId: lifecycleJob.id, actorId: poster.id, action: "INCIDENT_REPORTED",
    description: "isolated incident fixture", metadata: { reason: "isolated fixture" },
  }});
  evidence = await prisma.incidentEvidence.create({ data: {
    jobId: lifecycleJob.id, incidentId: incident.id, uploadedById: poster.id,
    fileName: "isolated.txt", mimeType: "text/plain", sizeBytes: 5,
    sha256: "2cf24dba5fb0a30e26e83b2ac5b9e29e1b161e5c1fa7425e73043362938b9824",
    content: Buffer.from("hello"),
  }});
  posterVehicle = await prisma.vehicle.create({ data: {
    accountId: poster.id, vehicleType: "van", regPlate: "CI-" + suffix,
    verificationStatus: "verified",
  }});
  driverVehicle = await prisma.vehicle.create({ data: {
    accountId: driver.id, vehicleType: "van", regPlate: "CID-" + suffix,
    verificationStatus: "verified", verifiedAt: new Date(),
    motValidUntil: new Date("2035-12-31T00:00:00.000Z"),
    insuranceValidUntil: new Date("2035-12-31T00:00:00.000Z"),
  }});

  const port = 32000 + (process.pid % 15000);
  base = "http://127.0.0.1:" + port;
  server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--port", String(port)], {
    env: { ...process.env, NEXTAUTH_URL: base, NEXTAUTH_SECRET: process.env.NEXTAUTH_SECRET || "ci-only-secret", NODE_ENV: "production" },
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

  const outsiderCookie = await makeCookie(outsider.id);
  const posterCookie = await makeCookie(poster.id);
  const driverCookie = await makeCookie(driver.id);

  const placedBidResponse = await api("/api/jobs/" + bidJob.id + "/bid", "POST", driverCookie, { amount: 95 });
  assert.ok([200, 201].includes(placedBidResponse.status),
    "eligible authenticated driver should place a bid (got " + placedBidResponse.status + "): " + await placedBidResponse.text());
  const placedBidBody = await placedBidResponse.json();
  assert.ok(placedBidBody.bid?.id, "successful bid response must return the created bid ID");
  bid = { id: placedBidBody.bid.id };

  // Establish that the signed JWT is accepted, and the vehicle collection is
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
    ["/api/jobs/" + lifecycleJob.id + "/edit", "PATCH", { pickup: "attacker edit" }],
    ["/api/jobs/" + lifecycleJob.id + "/payment/mark-paid", "POST", {}],
    ["/api/jobs/" + lifecycleJob.id + "/payment/confirm-received", "POST", {}],
    ["/api/jobs/" + lifecycleJob.id + "/incidents", "GET"],
    ["/api/jobs/" + lifecycleJob.id + "/incidents", "POST", { description: "attacker incident", reason: "fixture" }],
    ["/api/jobs/" + lifecycleJob.id + "/incidents/terminate", "POST", { reason: "fixture", description: "fixture" }],
    ["/api/jobs/" + lifecycleJob.id + "/incidents/updates", "POST", { parentIncidentId: incident.id, message: "attacker update" }],
    ["/api/jobs/" + lifecycleJob.id + "/incidents/" + incident.id + "/evidence", "POST", { fileName: "attacker.txt" }],
    ["/api/jobs/" + lifecycleJob.id + "/incidents/" + incident.id + "/evidence/" + evidence.id, "GET"],
  ];
  for (const [path, method, body] of outsiderCases) {
    const before = await snapshot();
    const anonymous = await api(path, method, null, body);
    assert.equal(anonymous.status, 401, method + " " + path + ": anonymous HTTP request must return 401");
    assert.deepEqual(await snapshot(), before, method + " " + path + ": anonymous request changed protected state");

    const response = await api(path, method, outsiderCookie, body);
    assert.ok(denyStatuses.has(response.status),
      method + " " + path + ": unrelated authenticated account must be denied (got " + response.status + ")");
    const after = await snapshot();
    assert.deepEqual(after, before, method + " " + path + ": denied request changed lifecycle/ownership/evidence/vehicle/notification state");
  }

  // An authenticated poster may accept the driver's valid bid; the unrelated
  // account above must not be able to accept that same bid.
  const acceptedBid = await api("/api/jobs/" + bidJob.id + "/bids/" + bid.id + "/accept", "POST", posterCookie, {});
  assert.ok([200, 201].includes(acceptedBid.status),
    "poster should accept the valid driver bid (got " + acceptedBid.status + "): " + await acceptedBid.text());
  const acceptedBidJob = await prisma.job.findUnique({ where: { id: bidJob.id } });
  assert.equal(acceptedBidJob.status, "accepted", "bid acceptance should claim the job");
  assert.equal(acceptedBidJob.acceptedById, driver.id, "bid acceptance should assign the bidding driver");

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

  // Reuse the same pre-existing session after deletion is requested.
  await prisma.account.update({ where: { id: outsider.id }, data: { deletionRequestedAt: new Date() } });
  const deletedGet = await api("/api/vehicles", "GET", outsiderCookie);
  assert.equal(deletedGet.status, 401, "pre-existing JWT must not read vehicles after deletion request");
  const deletedPost = await api("/api/vehicles", "POST", outsiderCookie, {
    vehicleType: "van", regPlate: "DEL-" + suffix,
  });
  assert.equal(deletedPost.status, 401, "pre-existing JWT must not create vehicles after deletion request");
  assert.equal(await prisma.vehicle.count({ where: { accountId: outsider.id } }), 0,
    "deletion-requested account must not create a vehicle");

  console.log("PASS authenticated lifecycle HTTP E2E in isolated CI DB: 22 outsider object-route denials with unchanged state, account-scoped vehicle reads, poster/driver pickup→delivery→payment flow, and pre-existing JWT revocation after deletion.");
} finally {
  if (server) {
    server.kill("SIGTERM");
    await Promise.race([new Promise((resolve) => server.once("exit", resolve)), delay(3000)]);
  }
  if (accountIds.length) {
    await prisma.incidentEvidence.deleteMany({ where: { OR: [{ uploadedById: { in: accountIds } }, { jobId: { in: jobIds } }] } }).catch(() => {});
    await prisma.jobActivity.deleteMany({ where: { OR: [{ actorId: { in: accountIds } }, { jobId: { in: jobIds } }] } }).catch(() => {});
    await prisma.bid.deleteMany({ where: { OR: [{ bidderId: { in: accountIds } }, { jobId: { in: jobIds } }] } }).catch(() => {});
    await prisma.vehicle.deleteMany({ where: { accountId: { in: accountIds } } }).catch(() => {});
    await prisma.notification.deleteMany({ where: { accountId: { in: accountIds } } }).catch(() => {});
    await prisma.job.deleteMany({ where: { OR: [{ id: { in: jobIds } }, { posterId: { in: accountIds } }] } }).catch(() => {});
    await prisma.account.deleteMany({ where: { id: { in: accountIds } } }).catch(() => {});
  }
  await prisma.$disconnect();
}
