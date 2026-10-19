#!/usr/bin/env node
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";

const db = new URL(process.env.DATABASE_URL);
db.username = "post2drive_ops_readonly";
db.password = "ci-dashboard-readonly-password";
const port = 31000 + (process.pid % 20000);
const env = {
  ...process.env,
  PORT: String(port),
  OPS_DASHBOARD_DATABASE_URL: db.toString(),
  OPS_DASHBOARD_USERNAME: "ci-admin",
  OPS_DASHBOARD_PASSWORD: "ci-dashboard-password-12345",
  OPS_DASHBOARD_SESSION_SECRET: "ci-only-dashboard-session-secret-0123456789abcdef",
  NODE_ENV: "test",
};
delete env.OPS_DASHBOARD_BRIDGE_SECRET;
delete env.POST2DRIVE_APP_URL;
const child = spawn(process.execPath, ["ops-dashboard/server.mjs"], { env, stdio: ["ignore", "pipe", "pipe"] });
let output = "";
child.stdout.on("data", (b) => { output += b.toString(); });
child.stderr.on("data", (b) => { output += b.toString(); });
const base = "http://127.0.0.1:" + port;
const request = (path, options = {}) => fetch(base + path, { ...options, signal: AbortSignal.timeout(3000) });

try {
  let ready = false;
  for (let attempt = 0; attempt < 80; attempt++) {
    if (child.exitCode !== null) throw new Error("Dashboard exited during startup:\n" + output);
    try {
      const response = await request("/health");
      if (response.status === 200) { ready = true; break; }
    } catch {}
    await delay(150);
  }
  assert.equal(ready, true, "isolated dashboard must pass its health check:\n" + output);

  const root = await request("/admin-access");
  assert.equal(root.status, 200, "unauthenticated dashboard root should show the login screen");
  assert.match(await root.text(), /Administrator access is separate from customer accounts/);

  const noSessionMetrics = await request("/admin-access/api/metrics");
  assert.equal(noSessionMetrics.status, 401, "metrics API must reject unauthenticated requests");
  const tamperedCookie = await request("/admin-access/api/metrics", { headers: { cookie: "ops_session=1.invalid" } });
  assert.equal(tamperedCookie.status, 401, "tampered session cookie must be rejected");

  const badLogin = await request("/admin-access/login", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ username: "wrong-admin", password: "wrong-password-12345" }),
    redirect: "manual",
  });
  assert.equal(badLogin.status, 401, "invalid dashboard credentials must be rejected");
  assert.equal(badLogin.headers.get("set-cookie"), null, "invalid login must not mint a session cookie");

  const login = await request("/admin-access/login", {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ username: "ci-admin", password: "ci-dashboard-password-12345" }),
    redirect: "manual",
  });
  assert.equal(login.status, 303, "valid dashboard credentials should establish a session");
  const setCookie = login.headers.get("set-cookie") || "";
  assert.match(setCookie, /ops_session=/);
  assert.match(setCookie, /HttpOnly/i);
  assert.match(setCookie, /SameSite=Strict/i);
  assert.match(setCookie, /Path=\/admin-access/);
  const cookie = setCookie.split(";")[0];

  const metrics = await request("/admin-access/api/metrics?days=1", { headers: { cookie } });
  assert.equal(metrics.status, 200, "authenticated metrics API should return successfully");
  const metricsBody = await metrics.json();
  assert.ok(Array.isArray(metricsBody.warnings), "metrics response should preserve coverage warnings");

  const campaigns = await request("/admin-access/api/qa-campaigns", { headers: { cookie } });
  assert.equal(campaigns.status, 200, "authenticated QA campaign read endpoint should return successfully");

  const crossOriginAction = await request("/admin-access/api/admin-action", {
    method: "POST",
    headers: { cookie, origin: "https://attacker.invalid", "content-type": "application/json" },
    body: JSON.stringify({ action: "tester-generate-code" }),
  });
  assert.equal(crossOriginAction.status, 403, "authenticated cross-origin admin action must be rejected");

  const sameOriginUnconfiguredBridge = await request("/admin-access/api/admin-action", {
    method: "POST",
    headers: { cookie, origin: base, "content-type": "application/json" },
    body: JSON.stringify({ action: "tester-generate-code" }),
  });
  assert.equal(sameOriginUnconfiguredBridge.status, 503,
    "same-origin action must fail closed when the external signed bridge is unconfigured");

  const logout = await request("/admin-access/logout", { method: "POST", headers: { cookie }, redirect: "manual" });
  assert.equal(logout.status, 303, "logout should redirect");
  assert.match(logout.headers.get("set-cookie") || "", /Max-Age=0/);
  const afterLogout = await request("/admin-access/api/metrics", { headers: { cookie } });
  assert.equal(afterLogout.status, 401, "logged-out session must no longer authorize API reads");

  console.log("PASS isolated Ops Dashboard auth E2E: anonymous/tampered sessions denied, invalid login denied, valid login/cookie works, protected reads succeed, cross-origin actions denied, unconfigured bridge fails closed, logout revokes session.");
} finally {
  child.kill("SIGTERM");
  await Promise.race([
    new Promise((resolve) => child.once("exit", resolve)),
    delay(3000),
  ]);
}
