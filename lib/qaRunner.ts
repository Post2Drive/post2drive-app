// Durable staging QA runner library. This module is shared by the web queue and the
// separate Railway worker; it never creates or claims a run itself.
import { isQaRunnerEnabled } from "./qaRunnerGuard.ts";
import { prisma } from "./prisma.ts";
import { VEHICLE_TYPES } from "./vehicles.ts";
import { getMarket } from "./market.ts";

type AccountFixture = {
  index: number;
  email: string;
  password: string;
  accountId: string;
  cohort: "poster-focused" | "driver-focused" | "both" | "restricted";
  client?: ApiClient;
};
type EventResult = { path: string; duration: number; passed: boolean };
type QaTestType = "api-load" | "synthetic-accounts" | "workflow-e2e";

let active = false;

function safeJson(value: unknown) {
  try { return JSON.parse(JSON.stringify(value)); } catch { return {}; }
}

class ApiClient {
  private cookies = new Map<string, string>();
  private readonly account: AccountFixture;
  private readonly base: string;
  private readonly runId: string;
  constructor(account: AccountFixture, base: string, runId: string) {
    this.account = account;
    this.base = base;
    this.runId = runId;
  }
  private absorb(headers: Headers) {
    const h = headers as Headers & { getSetCookie?: () => string[] };
    const values = typeof h.getSetCookie === "function" ? h.getSetCookie() : (headers.get("set-cookie") ? [headers.get("set-cookie")!] : []);
    for (const value of values) {
      const first = value.split(";")[0];
      const i = first.indexOf("=");
      if (i < 1) continue;
      const key = first.slice(0, i).trim();
      const val = first.slice(i + 1).trim();
      if (!val || /max-age=0/i.test(value)) this.cookies.delete(key);
      else this.cookies.set(key, val);
    }
  }
  private cookie() { return [...this.cookies.entries()].map(([k, v]) => k + "=" + v).join("; "); }
  async login() {
    const csrfResponse = await fetch(this.base + "/api/auth/csrf", { headers: { "x-post2drive-qa-run-id": this.runId }, redirect: "manual", signal: AbortSignal.timeout(15000) });
    this.absorb(csrfResponse.headers);
    const csrf = await csrfResponse.json();
    if (!csrf?.csrfToken) return { status: csrfResponse.status, ok: false };
    const form = new URLSearchParams({ csrfToken: csrf.csrfToken, email: this.account.email, password: this.account.password, callbackUrl: this.base + "/", json: "true" });
    const login = await fetch(this.base + "/api/auth/callback/credentials", {
      method: "POST", redirect: "manual",
      headers: { "content-type": "application/x-www-form-urlencoded", cookie: this.cookie(), "x-post2drive-qa-run-id": this.runId },
      body: form,
      signal: AbortSignal.timeout(15000),
    });
    this.absorb(login.headers);
    const sessionResponse = await fetch(this.base + "/api/auth/session", {
      headers: { cookie: this.cookie(), "x-post2drive-qa-run-id": this.runId }, redirect: "manual", signal: AbortSignal.timeout(15000),
    });
    this.absorb(sessionResponse.headers);
    const session = await sessionResponse.json().catch(() => null);
    return { status: sessionResponse.status, ok: Boolean(session?.user?.accountId === this.account.accountId) };
  }
  async request(path: string, method = "GET", body?: unknown) {
    const headers: Record<string, string> = { accept: "application/json", "x-post2drive-qa-run-id": this.runId };
    const cookie = this.cookie();
    if (cookie) headers.cookie = cookie;
    const init: RequestInit = { method, headers, redirect: "manual", signal: AbortSignal.timeout(15000) };
    if (body !== undefined && method !== "GET" && method !== "HEAD") {
      headers["content-type"] = "application/json";
      init.body = JSON.stringify(body);
    }
    const response = await fetch(this.base + path, init);
    this.absorb(response.headers);
    const text = await response.text();
    let data: any = null;
    try { data = text ? JSON.parse(text) : null; } catch { data = { text: text.slice(0, 250) }; }
    return { status: response.status, data };
  }
}

async function runQA(countryOverride: string, runId: string, workerId: string, testType: QaTestType) {
  const base = (process.env.QA_BASE_URL || "").replace(/\/+$/, "");
  const db = process.env.DATABASE_URL || "";
  const countryCode = (countryOverride || process.env.QA_MARKET_COUNTRY || "GB").trim().toUpperCase();
  const market = getMarket(countryCode);
  if (!market) throw new Error("QA_MARKET_COUNTRY must be a supported country code.");
  const selectedMarket = market;
  if (!isQaRunnerEnabled()) {
    throw new Error("QA runner is disabled unless an explicitly allow-listed staging deployment and isolated QA database are configured.");
  }
  if (!base.startsWith("https://") || !db || process.env.QA_ACCOUNT_COUNT !== "10000" || process.env.POST2DRIVE_QA_DATABASE_ISOLATED !== "true") throw new Error("QA preflight requires an HTTPS staging target, an explicitly isolated DATABASE_URL and QA_ACCOUNT_COUNT=10000.");
  const marker = "QA-" + runId;
  const started = Date.now();
  const events: EventResult[] = [];
  let createdAccounts = 0;
  let routeMatrixExecuted = 0;
  const routeMatrixTarget = testType === "synthetic-accounts" ? 0 : 10_000;
  const fixtures: AccountFixture[] = [];
  let accountPoolRunId: string | null = null;

  async function record(e: { index?: number; accountId?: string; cohort?: string; scenario: string; action: string; method: string; path: string; expected: number[]; actual: number | null; duration: number; details?: Record<string, unknown> }) {
    const passed = e.actual !== null && e.expected.includes(e.actual);
    events.push({ path: e.path, duration: e.duration, passed });
    await prisma.$executeRawUnsafe(
      'INSERT INTO qa_test_events(run_id,account_index,account_id,cohort,scenario,action,method,path,expected_statuses,actual_status,passed,duration_ms,details) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13::jsonb)',
      runId, e.index ?? null, e.accountId ?? null, e.cohort ?? null, e.scenario, e.action, e.method, e.path, e.expected, e.actual, passed, e.duration, JSON.stringify({ marker, ...(e.details || {}) }),
    );
    return passed;
  }

  async function check(client: ApiClient | null, account: AccountFixture | null, scenario: string, action: string, method: string, path: string, body: unknown, expected: number[]) {
    const t = Date.now();
    let status: number | null = null;
    let data: any = null;
    try {
      const headers: Record<string, string> = { accept: "application/json", "x-post2drive-qa-run-id": runId };
      const init: RequestInit = { method, headers, redirect: "manual" };
      if (client) {
        const result = await client.request(path, method, body);
        status = result.status; data = result.data;
      } else {
        if (body !== undefined && method !== "GET" && method !== "HEAD") {
          headers["content-type"] = "application/json";
          init.body = JSON.stringify(body);
        }
        const response = await fetch(base + path, init);
        status = response.status;
        const text = await response.text();
        try { data = text ? JSON.parse(text) : null; } catch { data = {}; }
      }
    } catch (error) {
      data = { networkError: error instanceof Error ? error.message : String(error) };
    }
    const details: Record<string, unknown> = {};
    if (data && typeof data === "object") {
      for (const key of ["success", "error", "reason", "jobId", "status", "allowed", "planType", "verificationStatus"]) {
        if (data[key] !== undefined) details[key] = data[key];
      }
      if (data.job?.id) details.jobId = data.job.id;
      if (data.bid?.id) details.bidId = data.bid.id;
      if (data.networkError) details.networkError = String(data.networkError).slice(0, 250);
    }
    const passed = await record({ index: account?.index, accountId: account?.accountId, cohort: account?.cohort, scenario, action, method, path, expected, actual: status, duration: Date.now() - t, details });
    return { status, data, passed };
  }

  async function parallel<T>(items: T[], concurrency: number, fn: (item: T, index: number) => Promise<void>) {
    let cursor = 0;
    await Promise.all(Array.from({ length: concurrency }, async () => {
      while (true) {
        const index = cursor++;
        if (index >= items.length) return;
        await fn(items[index], index);
      }
    }));
  }

  async function finish(status: string, extra: Record<string, unknown> = {}) {
    const passed = events.filter(e => e.passed).length;
    const failed = events.length - passed;
    const finalStatus = status === "completed" && (failed > 0 || routeMatrixExecuted !== routeMatrixTarget) ? "failed" : status;
    const durations = events.map(e => e.duration).sort((a, b) => a - b);
    const percentile = (p: number) => durations.length ? durations[Math.floor((durations.length - 1) * p)] : 0;
    const byPath: Record<string, { count: number; failures: number; durations: number[] }> = {};
    for (const e of events) {
      const row = byPath[e.path] ||= { count: 0, failures: 0, durations: [] };
      row.count++; row.durations.push(e.duration); if (!e.passed) row.failures++;
    }
    const endpoints: Record<string, unknown> = {};
    for (const [path, row] of Object.entries(byPath)) {
      row.durations.sort((a, b) => a - b);
      endpoints[path] = { count: row.count, failures: row.failures, p50Ms: row.durations[Math.floor((row.durations.length - 1) * 0.5)], p95Ms: row.durations[Math.floor((row.durations.length - 1) * 0.95)], maxMs: row.durations[row.durations.length - 1] };
    }
    const summary = {
      runId, marker, status: finalStatus, testType, target: base, targetAccounts: 10_000, country: selectedMarket.country, currency: selectedMarket.currency, marketLabel: selectedMarket.label, createdAccounts, eventCount: events.length, routeMatrixTarget, routeMatrixExecuted, accountPoolSize: fixtures.length, accountPoolRunId,
      passed, failed, durationMs: Date.now() - started, p50Ms: percentile(0.5), p95Ms: percentile(0.95),
      cohorts: { posterFocused: 100, driverFocused: 150, both: 9_749, restricted: 1 },
      endpoints, syntheticDataRetained: true, realMoneyPaymentsAttempted: false, emailDeliveryTested: false, ...extra,
    };
    const finalized = await prisma.$executeRawUnsafe(
      "UPDATE qa_test_runs SET status=$2,finished_at=now(),created_accounts=$3,successful_checks=$4,failed_checks=$5,duration_ms=$6,summary=COALESCE(summary,'{}'::jsonb) || $7::jsonb WHERE id=$1 AND status='running' AND summary->>'workerId'=$8",
      runId, finalStatus, createdAccounts, passed, failed, Date.now() - started, JSON.stringify(summary), workerId,
    );
    if (Number(finalized) !== 1) {
      throw new Error("QA worker lost ownership before run finalization; refusing to overwrite the current run state.");
    }
    console.log("POST2DRIVE_QA_RESULT " + JSON.stringify(summary));
    return summary;
  }

  const claimed = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
    "SELECT id FROM qa_test_runs WHERE id=$1 AND status='running' AND target_url=$2 AND target_accounts=10000 AND summary->>'workerId'=$3",
    runId, base, workerId,
  );
  if (claimed.length !== 1) {
    throw new Error("QA worker must claim an existing queued run for this exact staging target before execution.");
  }


  try {
    console.log("Starting staging QA run " + runId + " type=" + testType + " for " + market.country + "/" + market.currency + " at " + base);
    await parallel(Array.from({ length: testType === "synthetic-accounts" ? 10_000 : 0 }, (_, i) => i), 12, async i => {
      const cohort: AccountFixture["cohort"] = i < 100 ? "poster-focused" : i < 250 ? "driver-focused" : i < 9_999 ? "both" : "restricted";
      const email = "qa-" + runId + "-" + String(i + 1).padStart(3, "0") + "@post2drive.invalid";
      const password = "QA-" + runId + "-" + String(i + 1).padStart(5, "0") + "-p2d";
      const payload = {
        name: "QA User " + (i + 1), email, phone: selectedMarket.dialingCode + "770090" + String(i).padStart(4, "0"),
        password, companyName: "[QA-" + runId + "] " + cohort + " " + String(i + 1).padStart(3, "0"),
        planType: "individual", fleetVehicleCount: 1, isSoleTrader: true,
        country: market.country, currency: market.currency,
        termsAccepted: true, termsVersion: "2026-10-16",
      };
      const t = Date.now();
      let status: number | null = null;
      let data: any = null;
      try {
        const response = await fetch(base + "/api/signup", { method: "POST", headers: { "content-type": "application/json", accept: "application/json", "x-post2drive-qa-run-id": runId }, body: JSON.stringify(payload), redirect: "manual", signal: AbortSignal.timeout(15000) });
        status = response.status;
        data = await response.json().catch(() => null);
      } catch (error) { data = { networkError: String(error) }; }
      await record({ index: i, cohort, scenario: "account-provisioning", action: "signup", method: "POST", path: "/api/signup", expected: [201], actual: status, duration: Date.now() - t, details: { error: data?.error || data?.networkError } });
      if (status !== 201 || !data?.accountId) return;
      const accountId = String(data.accountId);
      const persistStarted = Date.now();
      try {
        await prisma.$transaction(async tx => {
          const ukPromotion = market.country === "GB" && i !== 9_999;
          const paidWeeklyMarket = market.country !== "GB" && market.country !== "IN" && i !== 9_999;
          const accessEndsAt = new Date(Date.now() + 60 * 86400000);
          await tx.account.update({
            where: { id: accountId },
            data: {
              isTester: i !== 9_999,
              verificationStatus: i === 9_999 ? "not_started" : "verified",
              verifiedAt: i === 9_999 ? null : new Date(),
              promotionParticipant: ukPromotion,
              trialStartedAt: ukPromotion ? new Date() : null,
              trialEndsAt: ukPromotion ? accessEndsAt : null,
              freeEndsAt: ukPromotion ? accessEndsAt : null,
              subscriptionStatus: ukPromotion ? "promotional" : paidWeeklyMarket ? "active" : "inactive",
              subscriptionEndsAt: paidWeeklyMarket ? accessEndsAt : null,
            },
          });
          await tx.$executeRawUnsafe("INSERT INTO qa_test_accounts(run_id,account_id,email,cohort,account_index) VALUES($1,$2,$3,$4,$5)", runId, accountId, email, cohort, i + 1);
        }, { maxWait: 10000, timeout: 15000 });
        fixtures.push({ index: i, email, password, accountId, cohort });
        createdAccounts++;
      } catch (error) {
        try {
          await record({ index: i, accountId, cohort, scenario: "account-provisioning", action: "persist-synthetic-fixture", method: "DB", path: "qa_test_accounts", expected: [200], actual: 500, duration: Date.now() - persistStarted, details: { error: error instanceof Error ? error.message.slice(0, 250) : String(error).slice(0, 250) } });
        } catch {}
      }
    });

    await prisma.$executeRawUnsafe("UPDATE qa_test_runs SET created_accounts=$2 WHERE id=$1", runId, createdAccounts);
    if (testType === "synthetic-accounts") {
      if (createdAccounts !== 10_000) return await finish("aborted", { testType, reason: "Account provisioning did not create exactly 10,000 accounts.", createdAccounts });
      accountPoolRunId = runId;
      return await finish("completed", { testType, accountProvisioningOnly: true, syntheticDataRetained: true, limitations: ["Only synthetic-account creation and fixture persistence were tested; no cleanup was performed."] });
    }

    const pools = await prisma.$queryRawUnsafe<Array<{ id: string }>>(
      "SELECT id FROM qa_test_runs WHERE status='completed' AND summary->>'testType'='synthetic-accounts' AND summary->>'country'=$1 ORDER BY finished_at DESC LIMIT 1",
      selectedMarket.country,
    );
    accountPoolRunId = pools[0]?.id ?? null;
    if (!accountPoolRunId) throw new Error("Run the 10,000 synthetic-accounts test for this market before API-load or workflow-e2e.");
    const poolRows = await prisma.$queryRawUnsafe<Array<{ account_id: string; email: string; cohort: string; account_index: number }>>(
      "SELECT account_id,email,cohort,account_index FROM qa_test_accounts WHERE run_id=$1 ORDER BY account_index",
      accountPoolRunId,
    );
    if (poolRows.length !== 10_000) throw new Error("The preserved synthetic-account pool is incomplete; expected exactly 10,000 accounts.");
    fixtures.push(...poolRows.map((row) => ({
      index: Number(row.account_index) - 1,
      email: row.email,
      password: "QA-" + accountPoolRunId + "-" + String(row.account_index).padStart(5, "0") + "-p2d",
      accountId: row.account_id,
      cohort: row.cohort as AccountFixture["cohort"],
    })));

    await parallel(fixtures.filter(account => account.index < 499 || account.index === 9_999), 16, async account => {
      const client = new ApiClient(account, base, runId);
      const t = Date.now();
      let status = 401;
      let ok = false;
      let error: string | null = null;
      try {
        const login = await client.login(); status = login.status; ok = login.ok;
        if (!ok) error = "Session did not resolve to this synthetic account.";
      } catch (e) { error = e instanceof Error ? e.message : String(e); }
      await record({ index: account.index, accountId: account.accountId, cohort: account.cohort, scenario: "authentication", action: "login-and-session-isolation", method: "POST", path: "/api/auth/callback/credentials", expected: [200], actual: ok ? 200 : status, duration: Date.now() - t, details: { error } });
      if (ok) account.client = client;
    });

    const signed = fixtures.filter(a => a.client);
    await parallel(signed, 4, async a => {
      for (const [path, action] of [
        ["/api/account", "account-self-read"], ["/api/account/access", "marketplace-access"],
        ["/api/jobs", "job-list-search"], ["/api/vehicles", "vehicle-list"],
        ["/api/payments", "payment-summary"], ["/api/promotion/status", "promotion-status"],
        ["/api/promotion/referrals/progress", "referral-progress"],
      ] as const) await check(a.client!, a, "authenticated-baseline", action, "GET", path, undefined, [200]);
    });

    if (testType === "api-load") {
      const loadPaths = ["/api/account", "/api/account/access", "/api/jobs", "/api/vehicles", "/api/payments", "/api/promotion/status", "/api/promotion/referrals/progress"];
      await parallel(Array.from({ length: routeMatrixTarget }, (_, i) => i), 12, async i => {
        const account = signed.length ? signed[i % signed.length] : null;
        const path = loadPaths[i % loadPaths.length];
        await check(account?.client ?? null, account, "api-load", "authenticated-read-" + i, "GET", path, undefined, [200]);
        routeMatrixExecuted++;
      });
      return await finish("completed", { testType, loadRequestCount: routeMatrixExecuted, authenticatedAccountsUsed: signed.length, syntheticDataRetained: true, limitations: ["This is a 10,000-request authenticated API load test, not a browser performance test; no cleanup was performed."] });
    }

    if (testType === "api-load") {
      const loadPaths = ["/api/account", "/api/account/access", "/api/jobs", "/api/vehicles", "/api/payments", "/api/promotion/status", "/api/promotion/referrals/progress"];
      const loadAccounts = signed.filter((account) => account.index < 499);
      await parallel(Array.from({ length: routeMatrixTarget }, (_, i) => i), 12, async i => {
        const account = loadAccounts.length ? loadAccounts[i % loadAccounts.length] : null;
        const path = loadPaths[i % loadPaths.length];
        await check(account?.client ?? null, account, "api-load", "authenticated-read-" + i, "GET", path, undefined, [200]);
        routeMatrixExecuted++;
      });
      return await finish("completed", { testType, loadRequestCount: routeMatrixExecuted, authenticatedAccountsUsed: loadAccounts.length, accountPoolRunId, syntheticDataRetained: true, limitations: ["This is a 10,000-request authenticated API load test, not a browser performance test; no cleanup was performed."] });
    }

    const posters = signed.filter(a => a.index < 100);
    const drivers = signed.filter(a => a.index >= 100 && a.index < 250);
    const both = signed.filter(a => a.index >= 250 && a.index < 499);
    // Synthetic endpoints deliberately carry the market code so a test run never
    // seeds UK city names into another country's fixtures.
    const laneMiles = [118, 86, 120, 95, 47, 35, 28, 44, 80, 35, 65, 58, 82, 80, 35];
    const lanes = laneMiles.map((miles, index) => ({
      pickup: "QA Origin " + market.country + " " + (index + 1),
      dropoff: "QA Destination " + market.country + " " + (index + 1),
      miles,
    }));
    const freightProfiles = [
      { vehicleType: "Motorcycle courier", weightKg: 3, dimensions: "30x25x20 cm", cargo: "urgent documents", rate: 0.65 },
      { vehicleType: "Car", weightKg: 30, dimensions: "60x45x35 cm", cargo: "small parcels", rate: 0.75, range: "short" },
      { vehicleType: "Small van (SWB)", weightKg: 80, dimensions: "1.2x0.8x0.8 m", cargo: "parcel cartons", rate: 0.95, range: "short" },
      { vehicleType: "Medium van (MWB)", weightKg: 250, dimensions: "2.4x1.4x1.3 m", cargo: "boxed retail stock", rate: 1.05, range: "short" },
      { vehicleType: "Large van (LWB)", weightKg: 600, dimensions: "3.2x1.6x1.7 m", cargo: "light furniture", rate: 1.15, range: "medium" },
      { vehicleType: "Luton van", weightKg: 900, dimensions: "4.0x2.0x2.0 m", cargo: "household furniture", rate: 1.3, range: "medium" },
      { vehicleType: "7.5t box truck", weightKg: 2500, dimensions: "5.5x2.3x2.3 m", cargo: "palletised goods", rate: 1.6, range: "medium" },
      { vehicleType: "12t rigid", weightKg: 4500, dimensions: "7.0x2.4x2.5 m", cargo: "retail pallets", rate: 1.8, range: "medium" },
      { vehicleType: "18t rigid", weightKg: 8000, dimensions: "8.0x2.4x2.6 m", cargo: "manufacturing components", rate: 2.0, range: "medium" },
      { vehicleType: "32t HGV artic", weightKg: 18000, dimensions: "13.6x2.45x2.7 m", cargo: "full-load pallets", rate: 2.25, range: "long" },
      { vehicleType: "Refrigerated van/truck", weightKg: 1200, dimensions: "3.5x1.8x1.8 m", cargo: "temperature-controlled goods", rate: 1.8, range: "medium" },
      { vehicleType: "Flatbed", weightKg: 6000, dimensions: "8.0x2.4x2.5 m", cargo: "building materials", rate: 1.9, range: "long" },
      { vehicleType: "Tipper", weightKg: 9000, dimensions: "6.5x2.5x2.5 m", cargo: "aggregate", rate: 2.0, range: "long" },
      { vehicleType: "Pickup truck", weightKg: 300, dimensions: "1.8x1.3x0.6 m", cargo: "site equipment", rate: 1.0, range: "short" },
    ];
    const pickupSlots = ["06:30", "07:30", "09:00", "11:00", "13:00", "15:30", "17:00"];
    const jobPayload = (n: number, mode: "fixed" | "bid") => {
      // Synthetic distances and prices are deterministic test fixtures, not live routing results or market quotes.
      const profile = freightProfiles[Math.abs(n * 5) % freightProfiles.length];
      const lanePool = lanes.filter(lane => profile.range === "short" ? lane.miles <= 65 :
        profile.range === "medium" ? lane.miles >= 35 && lane.miles <= 86 : lane.miles >= 80);
      const lane = lanePool[Math.abs(n) % lanePool.length];
      const pickupTime = pickupSlots[Math.abs(n * 3) % pickupSlots.length];
      const pickupHour = Number(pickupTime.slice(0, 2));
      const dropoffHour = Math.min(23, pickupHour + Math.max(1, Math.ceil(lane.miles / 55)));
      const pad = (value: number) => String(value).padStart(2, "0");
      const jobDate = new Date(Date.now() + (2 + Math.abs(n) % 14) * 86400000).toISOString();
      const price = Math.max(35, Math.round(45 + lane.miles * profile.rate + profile.weightKg / 250));
      return {
        pickup: lane.pickup, dropoff: lane.dropoff, jobDate, pickupTime,
        dropoffTime: pad(dropoffHour) + ":00", vehicleType: profile.vehicleType,
        weightKg: profile.weightKg, dimensions: profile.dimensions, price, priceMode: mode, currency: market.currency,
        crossBorder: false,
        notes: "Synthetic QA only " + marker + "; lane=" + lane.pickup + " to " + lane.dropoff +
          "; estimatedMiles=" + lane.miles + "; cargo=" + profile.cargo + "; scenario=" + n,
        pickupContactName: "QA Contact", pickupContactPhone: market.dialingCode + "7700900111",
        dropoffContactName: "QA Receiver", dropoffContactPhone: market.dialingCode + "7700900112",
      };
    };
    async function createJob(p: AccountFixture, n: number, mode: "fixed" | "bid") {
      const r = await check(p.client!, p, "job-posting", "create-" + mode + "-job", "POST", "/api/jobs", jobPayload(n, mode), [201]);
      return r.status === 201 && r.data?.job?.id ? String(r.data.job.id) : null;
    }
    async function completeJob(id: string, p: AccountFixture, d: AccountFixture, n: number) {
      const pickup = await check(p.client!, p, "job-lifecycle", "poster-confirms-pickup", "POST", "/api/jobs/" + id + "/confirm-pickup", {}, [200]);
      if (pickup.status !== 200) return;
      const delivered = await check(d.client!, d, "job-lifecycle", "driver-marks-delivered", "POST", "/api/jobs/" + id + "/mark-delivered", {}, [200]);
      if (delivered.status !== 200) return;
      const confirmed = await check(p.client!, p, "job-lifecycle", "other-party-confirms-delivery", "POST", "/api/jobs/" + id + "/confirm-delivered", {}, [200]);
      if (confirmed.status !== 200) return;
      await check(p.client!, p, "job-history", "poster-reads-activity", "GET", "/api/jobs/" + id + "/activity", undefined, [200]);
      await check(p.client!, p, "ratings", "poster-rates-driver", "POST", "/api/ratings", { jobId: id, stars: n % 5 + 1, comment: "Synthetic QA " + marker }, [200]);
      const driverRatingPayload = { jobId: id, stars: (n + 2) % 5 + 1, comment: "Synthetic QA " + marker };
      const driverRatingRace = await Promise.all([
        check(d.client!, d, "concurrency", "driver-rating-race-a", "POST", "/api/ratings", driverRatingPayload, [200, 409]),
        check(d.client!, d, "concurrency", "driver-rating-race-b", "POST", "/api/ratings", { ...driverRatingPayload, comment: "Synthetic QA race " + marker }, [200, 409]),
      ]);
      const driverRatingWinners = driverRatingRace.filter(result => result.status === 200);
      await record({
        index: d.index, accountId: d.accountId, cohort: d.cohort,
        scenario: "concurrency", action: "exactly-one-driver-rating-wins",
        method: "POST", path: "/api/ratings", expected: [200],
        actual: driverRatingWinners.length === 1 && driverRatingRace.every(result => result.status === 200 || result.status === 409) ? 200 : 500,
        duration: 0, details: { statuses: driverRatingRace.map(result => result.status) },
      });
      await check(p.client!, p, "ratings", "duplicate-rating-blocked", "POST", "/api/ratings", { jobId: id, stars: 5 }, [409]);
      await check(p.client!, p, "payment-declarations", "poster-marks-paid-no-provider-charge", "POST", "/api/jobs/" + id + "/payment/mark-paid", {}, [200]);
      await check(d.client!, d, "payment-declarations", "driver-confirms-received-no-provider-charge", "POST", "/api/jobs/" + id + "/payment/confirm-received", {}, [200]);
    }

    for (let i = 0; i < 20 && i < posters.length && i < drivers.length; i++) {
      const p = posters[i], d = drivers[i], id = await createJob(p, i, "fixed");
      if (!id) continue;
      await check(d.client!, d, "job-search", "search-synthetic-marker", "GET", "/api/jobs?search=" + encodeURIComponent(marker), undefined, [200]);
      await check(d.client!, d, "job-search", "filter-by-price-and-vehicle", "GET", "/api/jobs?minPrice=35&maxPrice=700&vehicleType=Small%20van%20(SWB)", undefined, [200]);
      const editPayload = jobPayload(i + 2500, "fixed");
      await check(p.client!, p, "job-editing", "poster-edits-open-job", "PATCH", "/api/jobs/" + id + "/edit", { ...editPayload, price: editPayload.price + 5 }, [200]);
      const accepted = await check(d.client!, d, "job-assignment", "driver-accepts-fixed-job", "POST", "/api/jobs/" + id + "/accept", {}, [200]);
      if (accepted.status === 200) await completeJob(id, p, d, i);
    }

    for (let i = 0; i < 10 && i + 20 < posters.length && i + 20 < drivers.length; i++) {
      const p = posters[i + 20], d = drivers[i + 20], id = await createJob(p, 100 + i, "bid");
      if (!id) continue;
      await check(p.client!, p, "authorization", "poster-cannot-bid-own-job", "POST", "/api/jobs/" + id + "/bid", { amount: 100 }, [403]);
      await check(d.client!, d, "validation", "zero-bid-rejected", "POST", "/api/jobs/" + id + "/bid", { amount: 0 }, [400]);
      await check(d.client!, d, "validation", "malformed-string-bid-rejected", "POST", "/api/jobs/" + id + "/bid", { amount: "not-a-number" }, [400]);
      await check(d.client!, d, "validation", "null-bid-rejected", "POST", "/api/jobs/" + id + "/bid", { amount: null }, [400]);
      const bid = await check(d.client!, d, "bidding", "driver-places-bid", "POST", "/api/jobs/" + id + "/bid", { amount: 120 + i }, [200]);
      await check(p.client!, p, "bidding", "poster-lists-bids", "GET", "/api/jobs/" + id + "/bids", undefined, [200]);
      const bidId = bid.data?.bid?.id ? String(bid.data.bid.id) : "";
      if (!bidId) continue;
      const accepted = await check(p.client!, p, "bidding", "poster-accepts-bid", "POST", "/api/jobs/" + id + "/bids/" + bidId + "/accept", {}, [200]);
      if (accepted.status === 200) await completeJob(id, p, d, 100 + i);
    }

    for (let i = 0; i < 10 && i + 10 < both.length; i++) {
      const p = both[i], d = both[i + 10];
      const id = await createJob(p, 1000 + i, "fixed");
      if (id) {
        const accepted = await check(d.client!, d, "job-assignment", "mixed-role-driver-accepts", "POST", "/api/jobs/" + id + "/accept", {}, [200]);
        if (accepted.status === 200) await completeJob(id, p, d, 1000 + i);
      }
      const reverse = await createJob(d, 1100 + i, "fixed");
      if (reverse) {
        const acceptedReverse = await check(p.client!, p, "job-assignment", "mixed-role-poster-drives-reverse-load", "POST", "/api/jobs/" + reverse + "/accept", {}, [200]);
        if (acceptedReverse.status === 200) await completeJob(reverse, d, p, 1100 + i);
      }
    }

    if (posters.length >= 40 && drivers.length >= 50) {
      const p = posters[39], d1 = drivers[48], d2 = drivers[49], id = await createJob(p, 1500, "fixed");
      if (id) {
        const results = await Promise.all([
          check(d1.client!, d1, "concurrency", "driver-one-accept-race", "POST", "/api/jobs/" + id + "/accept", {}, [200, 409]),
          check(d2.client!, d2, "concurrency", "driver-two-accept-race", "POST", "/api/jobs/" + id + "/accept", {}, [200, 409]),
        ]);
        const winners = results.filter(r => r.status === 200);
        await record({ index: p.index, accountId: p.accountId, cohort: p.cohort, scenario: "concurrency", action: "exactly-one-driver-wins-race", method: "POST", path: "/api/jobs/" + id + "/accept", expected: [200], actual: winners.length === 1 && results.every(r => r.status === 200 || r.status === 409) ? 200 : 500, duration: 0, details: { statuses: results.map(r => r.status) } });
        if (winners.length === 1) await completeJob(id, p, winners[0] === results[0] ? d1 : d2, 1500);

      // Exercise the newly hardened pickup and delivery transitions under contention.
      // Each pair must produce exactly one state-changing success and one conflict.
      const p2 = posters[38], d3 = drivers[46];
      const lifecycleRaceJob = await createJob(p2, 1510, "fixed");
      if (lifecycleRaceJob) {
        const acceptedForRace = await check(d3.client!, d3, "concurrency", "driver-accepts-pickup-race-job", "POST", "/api/jobs/" + lifecycleRaceJob + "/accept", {}, [200]);
        if (acceptedForRace.status === 200) {
          const pickupRace = await Promise.all([
            check(p2.client!, p2, "concurrency", "poster-pickup-confirm-race", "POST", "/api/jobs/" + lifecycleRaceJob + "/confirm-pickup", {}, [200, 409]),
            check(d3.client!, d3, "concurrency", "driver-pickup-confirm-race", "POST", "/api/jobs/" + lifecycleRaceJob + "/confirm-pickup", {}, [200, 409]),
          ]);
          const pickupWinners = pickupRace.filter(result => result.status === 200);
          await record({
            index: p2.index, accountId: p2.accountId, cohort: p2.cohort,
            scenario: "concurrency", action: "exactly-one-pickup-transition-wins",
            method: "POST", path: "/api/jobs/" + lifecycleRaceJob + "/confirm-pickup",
            expected: [200], actual: pickupWinners.length === 1 && pickupRace.every(result => result.status === 200 || result.status === 409) ? 200 : 500,
            duration: 0, details: { statuses: pickupRace.map(result => result.status) },
          });
          if (pickupWinners.length === 1) {
            const deliveryRace = await Promise.all([
              check(p2.client!, p2, "concurrency", "poster-delivery-mark-race", "POST", "/api/jobs/" + lifecycleRaceJob + "/mark-delivered", {}, [200, 409]),
              check(d3.client!, d3, "concurrency", "driver-delivery-mark-race", "POST", "/api/jobs/" + lifecycleRaceJob + "/mark-delivered", {}, [200, 409]),
            ]);
            const deliveryWinners = deliveryRace.filter(result => result.status === 200);
            await record({
              index: p2.index, accountId: p2.accountId, cohort: p2.cohort,
              scenario: "concurrency", action: "exactly-one-delivery-transition-wins",
              method: "POST", path: "/api/jobs/" + lifecycleRaceJob + "/mark-delivered",
              expected: [200], actual: deliveryWinners.length === 1 && deliveryRace.every(result => result.status === 200 || result.status === 409) ? 200 : 500,
              duration: 0, details: { statuses: deliveryRace.map(result => result.status) },
            });
            if (deliveryWinners.length === 1) {
              const confirmer = deliveryRace[0].status === 200 ? d3 : p2;
              const confirmationRace = await Promise.all([
                check(confirmer.client!, confirmer, "concurrency", "delivery-confirm-race-a", "POST", "/api/jobs/" + lifecycleRaceJob + "/confirm-delivered", {}, [200, 409]),
                check(confirmer.client!, confirmer, "concurrency", "delivery-confirm-race-b", "POST", "/api/jobs/" + lifecycleRaceJob + "/confirm-delivered", {}, [200, 409]),
              ]);
              const confirmationWinners = confirmationRace.filter(result => result.status === 200);
              await record({
                index: confirmer.index, accountId: confirmer.accountId, cohort: confirmer.cohort,
                scenario: "concurrency", action: "exactly-one-delivery-confirmation-wins",
                method: "POST", path: "/api/jobs/" + lifecycleRaceJob + "/confirm-delivered",
                expected: [200], actual: confirmationWinners.length === 1 && confirmationRace.every(result => result.status === 200 || result.status === 409) ? 200 : 500,
                duration: 0, details: { statuses: confirmationRace.map(result => result.status) },
              });
            }
          }
        }
      }
      }
    }

    // Race two active bids for one job. Exactly one bid may claim the job.
    if (posters.length >= 38 && drivers.length >= 46) {
      const poster = posters[37], bidderA = drivers[44], bidderB = drivers[45];
      const raceJob = await createJob(poster, 1520, "bid");
      if (raceJob) {
        const bidResults = await Promise.all([
          check(bidderA.client!, bidderA, "concurrency", "bidder-a-submits-race-bid", "POST", "/api/jobs/" + raceJob + "/bid", { amount: 140 }, [200]),
          check(bidderB.client!, bidderB, "concurrency", "bidder-b-submits-race-bid", "POST", "/api/jobs/" + raceJob + "/bid", { amount: 160 }, [200]),
        ]);
        const bidIds = bidResults.map(result => result.data?.bid?.id ? String(result.data.bid.id) : "");
        if (bidResults.every(result => result.status === 200) && bidIds.every(Boolean)) {
          const acceptResults = await Promise.all([
            check(poster.client!, poster, "concurrency", "poster-accepts-bid-a-race", "POST", "/api/jobs/" + raceJob + "/bids/" + bidIds[0] + "/accept", {}, [200, 409]),
            check(poster.client!, poster, "concurrency", "poster-accepts-bid-b-race", "POST", "/api/jobs/" + raceJob + "/bids/" + bidIds[1] + "/accept", {}, [200, 409]),
          ]);
          const successful = acceptResults.filter(result => result.status === 200);
          await record({
            index: poster.index, accountId: poster.accountId, cohort: poster.cohort,
            scenario: "concurrency", action: "exactly-one-bid-claims-job",
            method: "POST", path: "/api/jobs/" + raceJob + "/bids/:bidId/accept",
            expected: [200], actual: successful.length === 1 && acceptResults.every(result => result.status === 200 || result.status === 409) ? 200 : 500,
            duration: 0, details: { statuses: acceptResults.map(result => result.status) },
          });
          if (successful.length === 1) {
            const winnerIndex = acceptResults[0].status === 200 ? 0 : 1;
            await completeJob(raceJob, poster, winnerIndex === 0 ? bidderA : bidderB, 1520);
          }
        } else {
          await record({
            index: poster.index, accountId: poster.accountId, cohort: poster.cohort,
            scenario: "concurrency", action: "both-bids-created-for-race",
            method: "POST", path: "/api/jobs/" + raceJob + "/bid",
            expected: [200], actual: 500, duration: 0,
            details: { statuses: bidResults.map(result => result.status), bidIdsPresent: bidIds.map(Boolean) },
          });
        }
      }
    }

    for (let i = 0; i < 5 && i + 40 < posters.length; i++) {
      const p = posters[i + 40], id = await createJob(p, 200 + i, "fixed");
      if (id) {
        await check(p.client!, p, "cancellation", "poster-cancels-open-job", "POST", "/api/jobs/" + id + "/cancel", {}, [200]);
        await check(p.client!, p, "state-guards", "double-cancel-rejected", "POST", "/api/jobs/" + id + "/cancel", {}, [409]);
      }
    }

    // Race two cancellation requests for the same open job. Exactly one must commit.
    if (posters.length > 55) {
      const p = posters[55], id = await createJob(p, 1530, "fixed");
      if (id) {
        const cancellationRace = await Promise.all([
          check(p.client!, p, "concurrency", "poster-cancel-race-a", "POST", "/api/jobs/" + id + "/cancel", {}, [200, 409]),
          check(p.client!, p, "concurrency", "poster-cancel-race-b", "POST", "/api/jobs/" + id + "/cancel", {}, [200, 409]),
        ]);
        const cancellationWinners = cancellationRace.filter(result => result.status === 200);
        await record({
          index: p.index, accountId: p.accountId, cohort: p.cohort,
          scenario: "concurrency", action: "exactly-one-cancellation-wins",
          method: "POST", path: "/api/jobs/" + id + "/cancel", expected: [200],
          actual: cancellationWinners.length === 1 && cancellationRace.every(result => result.status === 200 || result.status === 409) ? 200 : 500,
          duration: 0, details: { statuses: cancellationRace.map(result => result.status) },
        });
      }
    }
    for (let i = 0; i < 5 && i + 50 < posters.length && i + 50 < drivers.length; i++) {
      const p = posters[i + 50], d = drivers[i + 50], id = await createJob(p, 300 + i, "fixed");
      if (id) {
        const accepted = await check(d.client!, d, "job-assignment", "driver-accepts-before-backing-out", "POST", "/api/jobs/" + id + "/accept", {}, [200]);
        if (accepted.status === 200) await check(d.client!, d, "cancellation", "driver-backs-out", "POST", "/api/jobs/" + id + "/driver-cancel", {}, [200]);
      }
    }

    // Poster unassigns an accepted job and the job is reassigned to a different driver.
    for (let i = 0; i < 2 && i + 70 < posters.length && i + 80 < drivers.length; i++) {
      const p = posters[i + 70], d = drivers[i + 70], replacement = drivers[i + 80];
      const id = await createJob(p, 1900 + i, "fixed");
      if (!id) continue;
      const accepted = await check(d.client!, d, "job-assignment", "driver-accepts-before-poster-unassigns", "POST", "/api/jobs/" + id + "/accept", {}, [200]);
      if (accepted.status !== 200) continue;
      const unassigned = await check(p.client!, p, "job-reassignment", "poster-unassigns-driver", "POST", "/api/jobs/" + id + "/unassign", {}, [200]);
      if (unassigned.status !== 200) continue;
      const reassigned = await check(replacement.client!, replacement, "job-reassignment", "replacement-driver-accepts", "POST", "/api/jobs/" + id + "/accept", {}, [200]);
      if (reassigned.status === 200) await completeJob(id, p, replacement, 1900 + i);
    }

    // Delivery dispute path: poster rejects a delivery, driver re-marks delivered, poster confirms.
    for (let i = 0; i < 3 && i + 75 < posters.length && i + 75 < drivers.length; i++) {
      const p = posters[i + 75], d = drivers[i + 75];
      const id = await createJob(p, 1950 + i, "fixed");
      if (!id) continue;
      const accepted = await check(d.client!, d, "delivery-dispute", "driver-accepts-dispute-job", "POST", "/api/jobs/" + id + "/accept", {}, [200]);
      if (accepted.status !== 200) continue;
      const pickup = await check(p.client!, p, "delivery-dispute", "poster-confirms-pickup", "POST", "/api/jobs/" + id + "/confirm-pickup", {}, [200]);
      if (pickup.status !== 200) continue;
      const delivered = await check(d.client!, d, "delivery-dispute", "driver-marks-delivered", "POST", "/api/jobs/" + id + "/mark-delivered", {}, [200]);
      if (delivered.status !== 200) continue;
      const rejected = await check(p.client!, p, "delivery-dispute", "poster-rejects-delivery", "POST", "/api/jobs/" + id + "/reject-delivered", {}, [200]);
      if (rejected.status !== 200) continue;
      const redelivered = await check(d.client!, d, "delivery-dispute", "driver-reconfirms-delivery", "POST", "/api/jobs/" + id + "/mark-delivered", {}, [200]);
      if (redelivered.status !== 200) continue;
      const confirmed = await check(p.client!, p, "delivery-dispute", "poster-confirms-redelivery", "POST", "/api/jobs/" + id + "/confirm-delivered", {}, [200]);
      if (confirmed.status !== 200) continue;
      await check(p.client!, p, "job-history", "poster-reads-disputed-job-history", "GET", "/api/jobs/" + id + "/activity", undefined, [200]);
      await check(p.client!, p, "ratings", "poster-rates-after-dispute-resolution", "POST", "/api/ratings", { jobId: id, stars: 5, comment: "Synthetic QA " + marker }, [200]);
      await check(d.client!, d, "ratings", "driver-rates-after-dispute-resolution", "POST", "/api/ratings", { jobId: id, stars: 4, comment: "Synthetic QA " + marker }, [200]);
      await check(p.client!, p, "payment-declarations", "poster-marks-disputed-job-paid", "POST", "/api/jobs/" + id + "/payment/mark-paid", {}, [200]);
      await check(d.client!, d, "payment-declarations", "driver-confirms-disputed-job-payment", "POST", "/api/jobs/" + id + "/payment/confirm-received", {}, [200]);
    }

    await parallel(drivers.slice(0, 20), 2, async (a, i) => {
      const payload = {
        vehicleType: VEHICLE_TYPES[i % VEHICLE_TYPES.length], regPlate: "QA" + runId.replace(/\D/g, "").slice(-5) + String(i).padStart(3, "0"),
        ownershipType: ["owned", "leased", "rented", "other"][i % 4], make: "QA Make", model: "QA Model", mamKg: [350, 1800, 3500, 3500, 3500, 3500, 7500, 12000, 18000, 32000, 7500, 18000, 18000, 3500, 3500, 3500][i % VEHICLE_TYPES.length],
        v5cDocumentUrl: "https://example.invalid/qa-v5c.pdf", insuranceDocumentUrl: "https://example.invalid/qa-insurance.pdf",
        operatorLicenceNo: "QA-" + runId, motValidUntil: new Date(Date.now() + 180 * 86400000).toISOString(),
        insuranceValidUntil: new Date(Date.now() + 180 * 86400000).toISOString(),
      };
      await check(a.client!, a, "vehicles", "create-synthetic-vehicle", "POST", "/api/vehicles", payload, [201]);
      await check(a.client!, a, "vehicles", "duplicate-registration-rejected", "POST", "/api/vehicles", payload, [409]);
    });

    if (signed[0]) {
      await check(signed[0].client!, signed[0], "admin-access", "ordinary-user-cannot-read-admin", "GET", "/api/admin/testers", undefined, [403]);
      await check(signed[0].client!, signed[0], "payments", "pending-payment-record-without-real-charge", "POST", "/api/subscription/create-payment", {}, [200]);
    }
    const restricted = fixtures.find(a => a.index === 9_999);
    if (restricted?.client && posters[0]) {
      const sample = await createJob(posters[0], 1800, "bid");
      if (sample) await check(restricted.client, restricted, "access-control", market.country === "IN" ? "india-non-weekly-market-access-policy" : "restricted-account-cannot-bid", "POST", "/api/jobs/" + sample + "/bid", { amount: 100 }, market.country === "IN" ? [200] : [403, 402]);
    }

    // Exercise the API surface with 10,000 real requests per selected country.
    // The cases include unauthenticated access-control probes, malformed inputs,
    // unsupported methods, unknown-resource IDs, country immutability and admin gates.
    type RouteMatrixCase = {
      name: string;
      auth: boolean;
      method: string;
      path: (index: number, missingJobId: string) => string;
      body?: (index: number) => unknown;
      expected: number[];
    };
    const routeMatrixCases: RouteMatrixCase[] = [
      { name: "unauth-account-read", auth: false, method: "GET", path: () => "/api/account", expected: [401] },
      { name: "unauth-account-patch", auth: false, method: "PATCH", path: () => "/api/account", body: () => ({ name: "attacker" }), expected: [401] },
      { name: "unauth-account-delete", auth: false, method: "DELETE", path: () => "/api/account", body: () => ({ confirm: "DELETE", currentPassword: "wrong" }), expected: [401] },
      { name: "unauth-access-read", auth: false, method: "GET", path: () => "/api/account/access", expected: [401] },
      { name: "unauth-job-list", auth: false, method: "GET", path: () => "/api/jobs", expected: [401] },
      { name: "unauth-job-create", auth: false, method: "POST", path: () => "/api/jobs", body: () => ({}), expected: [401] },
      { name: "unauth-vehicle-list", auth: false, method: "GET", path: () => "/api/vehicles", expected: [401] },
      { name: "unauth-vehicle-create", auth: false, method: "POST", path: () => "/api/vehicles", body: () => ({}), expected: [401] },
      { name: "unauth-payment-summary", auth: false, method: "GET", path: () => "/api/payments", expected: [401] },
      { name: "unauth-notification-list", auth: false, method: "GET", path: () => "/api/notifications", expected: [401] },
      { name: "unauth-promotion-status", auth: false, method: "GET", path: () => "/api/promotion/status", expected: [401] },
      { name: "unauth-referral-progress", auth: false, method: "GET", path: () => "/api/promotion/referrals/progress", expected: [401] },
      { name: "unauth-rating-write", auth: false, method: "POST", path: () => "/api/ratings", body: () => ({ jobId: "missing", stars: 5 }), expected: [401] },
      { name: "unauth-subscription-create", auth: false, method: "POST", path: () => "/api/subscription/create-payment", body: () => ({}), expected: [401] },
      { name: "unauth-verification-start", auth: false, method: "POST", path: () => "/api/verification/start", body: () => ({}), expected: [401] },
      { name: "unauth-admin-performance", auth: false, method: "GET", path: () => "/api/admin/performance", expected: [401] },
      { name: "unauth-admin-research", auth: false, method: "GET", path: () => "/api/admin/research", expected: [401] },
      { name: "unauth-admin-testers", auth: false, method: "GET", path: () => "/api/admin/testers", expected: [401] },
      { name: "unauth-admin-incidents", auth: false, method: "GET", path: () => "/api/admin/incidents/resolve", expected: [401] },
      { name: "authenticated-job-search", auth: true, method: "GET", path: (i) => "/api/jobs?search=" + encodeURIComponent("QA-" + marker + "-" + i), expected: [200] },
      { name: "negative-min-price", auth: true, method: "GET", path: () => "/api/jobs?minPrice=-1", expected: [400] },
      { name: "nonnumeric-max-price", auth: true, method: "GET", path: () => "/api/jobs?maxPrice=not-a-number", expected: [400] },
      { name: "authenticated-account-read", auth: true, method: "GET", path: () => "/api/account", expected: [200] },
      { name: "authenticated-access-read", auth: true, method: "GET", path: () => "/api/account/access", expected: [200] },
      { name: "country-change-rejected", auth: true, method: "PATCH", path: () => "/api/account", body: () => ({ country: market.country === "IN" ? "GB" : "IN", currency: market.country === "IN" ? "GBP" : "INR" }), expected: [409] },
      { name: "authenticated-vehicle-list", auth: true, method: "GET", path: () => "/api/vehicles", expected: [200] },
      { name: "invalid-vehicle-type", auth: true, method: "POST", path: () => "/api/vehicles", body: () => ({ vehicleType: "not-a-vehicle" }), expected: [400] },
      { name: "authenticated-payment-summary", auth: true, method: "GET", path: () => "/api/payments", expected: [200] },
      { name: "notification-limit-clamped", auth: true, method: "GET", path: (i) => "/api/notifications?limit=" + (i % 150 - 20), expected: [200] },
      { name: "invalid-rating-rejected", auth: true, method: "POST", path: () => "/api/ratings", body: (i) => ({ jobId: "missing-" + i, stars: i % 9 - 2 }), expected: [400] },
      { name: "wrong-password-delete-rejected", auth: true, method: "DELETE", path: () => "/api/account", body: () => ({ confirm: "DELETE", currentPassword: "not-the-real-password" }), expected: [403] },
      { name: "authenticated-promotion-status", auth: true, method: "GET", path: () => "/api/promotion/status", expected: [200] },
      { name: "authenticated-referral-progress", auth: true, method: "GET", path: () => "/api/promotion/referrals/progress", expected: [200] },
      { name: "non-admin-performance-denied", auth: true, method: "GET", path: () => "/api/admin/performance", expected: [403] },
      { name: "non-admin-research-denied", auth: true, method: "GET", path: () => "/api/admin/research", expected: [403] },
      { name: "non-admin-testers-denied", auth: true, method: "GET", path: () => "/api/admin/testers", expected: [403] },
      { name: "non-admin-incidents-denied", auth: true, method: "GET", path: () => "/api/admin/incidents/resolve", expected: [403] },
      { name: "invalid-email-token", auth: true, method: "POST", path: () => "/api/email/verify", body: () => ({ token: "invalid" }), expected: [400] },
      { name: "invalid-resend-email", auth: true, method: "POST", path: () => "/api/email/verification/resend", body: () => ({ email: "not-an-email" }), expected: [200, 409, 503] },
      { name: "missing-job-read", auth: true, method: "GET", path: (i, id) => "/api/jobs/" + id, expected: [404] },
      { name: "missing-job-activity", auth: true, method: "GET", path: (i, id) => "/api/jobs/" + id + "/activity", expected: [404] },
      { name: "missing-job-bids", auth: true, method: "GET", path: (i, id) => "/api/jobs/" + id + "/bids", expected: [404] },
      { name: "missing-job-accept", auth: true, method: "POST", path: (i, id) => "/api/jobs/" + id + "/accept", body: () => ({}), expected: [404] },
      { name: "missing-job-bid", auth: true, method: "POST", path: (i, id) => "/api/jobs/" + id + "/bid", body: () => ({ amount: 0 }), expected: [404] },
      { name: "missing-job-cancel", auth: true, method: "POST", path: (i, id) => "/api/jobs/" + id + "/cancel", body: () => ({}), expected: [404] },
      { name: "missing-job-edit", auth: true, method: "PATCH", path: (i, id) => "/api/jobs/" + id + "/edit", body: () => ({}), expected: [404] },
      { name: "missing-job-confirm-pickup", auth: true, method: "POST", path: (i, id) => "/api/jobs/" + id + "/confirm-pickup", body: () => ({}), expected: [404] },
      { name: "missing-job-mark-delivered", auth: true, method: "POST", path: (i, id) => "/api/jobs/" + id + "/mark-delivered", body: () => ({}), expected: [404] },
      { name: "missing-job-confirm-delivered", auth: true, method: "POST", path: (i, id) => "/api/jobs/" + id + "/confirm-delivered", body: () => ({}), expected: [404] },
      { name: "missing-job-reject-delivered", auth: true, method: "POST", path: (i, id) => "/api/jobs/" + id + "/reject-delivered", body: () => ({}), expected: [404] },
      { name: "missing-job-driver-cancel", auth: true, method: "POST", path: (i, id) => "/api/jobs/" + id + "/driver-cancel", body: () => ({}), expected: [404] },
      { name: "missing-job-unassign", auth: true, method: "POST", path: (i, id) => "/api/jobs/" + id + "/unassign", body: () => ({}), expected: [404] },
      { name: "missing-job-mark-paid", auth: true, method: "POST", path: (i, id) => "/api/jobs/" + id + "/payment/mark-paid", body: () => ({}), expected: [404] },
      { name: "missing-job-confirm-received", auth: true, method: "POST", path: (i, id) => "/api/jobs/" + id + "/payment/confirm-received", body: () => ({}), expected: [404] },
      { name: "missing-job-incidents", auth: true, method: "GET", path: (i, id) => "/api/jobs/" + id + "/incidents", expected: [404] },
      { name: "missing-job-incident-create", auth: true, method: "POST", path: (i, id) => "/api/jobs/" + id + "/incidents", body: () => ({}), expected: [404] },
      { name: "missing-job-incident-terminate", auth: true, method: "POST", path: (i, id) => "/api/jobs/" + id + "/incidents/terminate", body: () => ({}), expected: [404] },
      { name: "missing-job-incident-updates", auth: true, method: "POST", path: (i, id) => "/api/jobs/" + id + "/incidents/updates", body: () => ({}), expected: [404] },
      { name: "missing-job-evidence-upload", auth: true, method: "POST", path: (i, id) => "/api/jobs/" + id + "/incidents/qa-missing-incident/evidence", body: () => ({}), expected: [404] },
      { name: "missing-job-evidence-read", auth: true, method: "GET", path: (i, id) => "/api/jobs/" + id + "/incidents/qa-missing-incident/evidence/qa-missing-evidence", expected: [404] },
      { name: "missing-bid-accept", auth: true, method: "POST", path: (i, id) => "/api/jobs/" + id + "/bids/qa-missing-bid/accept", body: () => ({}), expected: [404] },
      { name: "unsupported-edit-method", auth: true, method: "GET", path: (i, id) => "/api/jobs/" + id + "/edit", expected: [405] },
      { name: "unsupported-incident-terminate-method", auth: true, method: "GET", path: (i, id) => "/api/jobs/" + id + "/incidents/terminate", expected: [405] },
      { name: "unsupported-incident-update-method", auth: true, method: "GET", path: (i, id) => "/api/jobs/" + id + "/incidents/updates", expected: [405] },
      { name: "unauthenticated-health-is-public", auth: false, method: "GET", path: () => "/api/health", expected: [200] },
      { name: "qa-status-has-no-secret-data", auth: false, method: "GET", path: () => "/api/qa/run", expected: [200] },
      { name: "auth-session-is-public-safe", auth: false, method: "GET", path: () => "/api/auth/session", expected: [200] },
      { name: "auth-csrf-is-public-safe", auth: false, method: "GET", path: () => "/api/auth/csrf", expected: [200] },
      { name: "invalid-signup-is-rejected", auth: false, method: "POST", path: () => "/api/signup", body: () => ({}), expected: [400] },
      { name: "subscription-webhook-rejects-unsigned", auth: false, method: "POST", path: () => "/api/subscription/webhook", body: () => ({}), expected: [401] },
      { name: "verification-webhook-rejects-unsigned", auth: false, method: "POST", path: () => "/api/verification/start/webhook", body: () => ({}), expected: [401, 503] },
      { name: "qa-runner-rejects-unsigned-post", auth: false, method: "POST", path: () => "/api/qa/run", body: () => ({}), expected: [401] },
    ];
    await parallel(Array.from({ length: routeMatrixTarget }, (_, i) => i), 12, async i => {
      const scenario = routeMatrixCases[i % routeMatrixCases.length];
      const account = scenario.auth && signed.length ? signed[i % signed.length] : null;
      const missingJobId = "qa-missing-" + runId + "-" + i;
      const path = scenario.path(i, missingJobId);
      const body = scenario.body ? scenario.body(i) : undefined;
      await check(account?.client ?? null, account, "route-matrix", scenario.name + "-" + i, scenario.method, path, body, scenario.expected);
      routeMatrixExecuted++;
    });

    // Account deletion is intentionally not exercised so all synthetic records remain available for review.

    const count = async (query: string, ...params: unknown[]) => {
      const rows = await prisma.$queryRawUnsafe<Array<{ count: bigint | number }>>(query, ...params);
      return Number(rows[0]?.count ?? 0);
    };
    const persistedDataSummary = {
      qaMappedAccounts: await count("SELECT count(*)::int AS count FROM qa_test_accounts WHERE run_id=$1", runId),
      matchingAccounts: await count('SELECT count(*)::int AS count FROM "Account" a JOIN qa_test_accounts q ON q.account_id=a.id WHERE q.run_id=$1', runId),
      matchingUsers: await count('SELECT count(*)::int AS count FROM "User" u JOIN qa_test_accounts q ON q.account_id=u."accountId" WHERE q.run_id=$1', runId),
      syntheticJobs: await count('SELECT count(*)::int AS count FROM "Job" WHERE notes LIKE $1', "%" + marker + "%"),
      syntheticBids: await count('SELECT count(*)::int AS count FROM "Bid" b JOIN "Job" j ON j.id=b."jobId" WHERE j.notes LIKE $1', "%" + marker + "%"),
      syntheticRatings: await count('SELECT count(*)::int AS count FROM "Rating" r JOIN "Job" j ON j.id=r."jobId" WHERE j.notes LIKE $1', "%" + marker + "%"),
      syntheticVehicles: await count('SELECT count(*)::int AS count FROM "Vehicle" v JOIN qa_test_accounts q ON q.account_id=v."accountId" WHERE q.run_id=$1', runId),
      syntheticJobActivities: await count('SELECT count(*)::int AS count FROM "JobActivity" a JOIN "Job" j ON j.id=a."jobId" WHERE j.notes LIKE $1', "%" + marker + "%"),
      loggedInteractions: await count("SELECT count(*)::int AS count FROM qa_test_events WHERE run_id=$1", runId),
    };
    return await finish("completed", { testType, successfulLogins: signed.length, accountPoolRunId, persistedDataSummary, limitations: ["Email delivery and real provider settlements were not attempted.", "This is API-driven lifecycle simulation, not browser-based usability testing.", "Route distances and prices are deterministic synthetic estimates, not live routing results or market quotes.", "Account deletion and cleanup were intentionally not run; synthetic data is retained."] });
  } catch (error) {
    const failureMessage = error instanceof Error ? error.message : String(error);
    console.error("Staging QA runner exception", error);
    return await finish("failed", { exception: failureMessage.slice(0, 250) });
  }
}



export async function runQaWorker(runId: string, countryOverride: string, workerId: string, testType: QaTestType = "workflow-e2e") {
  if (!/^[A-Za-z0-9._:-]{1,80}$/.test(runId)) {
    throw new Error("Invalid QA run identifier.");
  }
  if (!workerId || workerId.length > 160) {
    throw new Error("Invalid QA worker identifier.");
  }
  if (!["api-load", "synthetic-accounts", "workflow-e2e"].includes(testType)) throw new Error("Invalid QA test type.");
  return runQA(countryOverride, runId, workerId, testType);
}
