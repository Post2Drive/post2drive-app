import { isQaRunnerEnabled } from "@/lib/qaRunnerGuard";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { VEHICLE_TYPES } from "@/lib/vehicles";
import { getMarket } from "@/lib/market";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

type AccountFixture = {
  index: number;
  email: string;
  password: string;
  accountId: string;
  cohort: "poster-focused" | "driver-focused" | "both" | "restricted";
  client?: ApiClient;
};
type EventResult = { path: string; duration: number; passed: boolean };

let active = false;
let activeRunId: string | null = null;
let lastRunId: string | null = null;
let lastFinishedAt: string | null = null;
let lastError: string | null = null;

function safeJson(value: unknown) {
  try { return JSON.parse(JSON.stringify(value)); } catch { return {}; }
}

class ApiClient {
  private cookies = new Map<string, string>();
  constructor(private readonly account: AccountFixture, private readonly base: string, private readonly runId: string) {}
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

async function cleanupSyntheticRuns(runIds: string[], base: string) {
  return prisma.$transaction(async tx => {
    const results: Array<Record<string, unknown>> = [];
    for (const runId of runIds) {
      const runs = await tx.$queryRawUnsafe<Array<{ id: string; target_url: string; status: string; target_accounts: number; created_accounts: number }>>(
        "SELECT id,target_url,status,target_accounts,created_accounts FROM qa_test_runs WHERE id=$1",
        runId
      );
      const run = runs[0];
      const allowedStatuses = new Set(["completed", "running", "failed", "aborted"]);
      if (!run || !allowedStatuses.has(run.status) || run.target_url !== base || run.target_accounts !== 500) {
        throw new Error("Cleanup refused: run must be an explicitly named 500-account QA run for this exact staging target: " + runId);
      }
      const marker = "%QA-" + runId + "%";
      const emailPattern = "qa-" + runId + "-%@post2drive.invalid";
      const counts: Record<string, number> = {};
      const exec = async (name: string, query: string, ...params: unknown[]) => {
        counts[name] = Number(await tx.$executeRawUnsafe(query, ...params));
      };
      const qaAccounts = 'WITH qa_accounts AS (SELECT account_id FROM qa_test_accounts WHERE run_id=$1 UNION SELECT id FROM "Account" WHERE "companyName" LIKE $2 UNION SELECT "accountId" FROM "User" WHERE email LIKE $3) ';
      const qaJobs = 'WITH qa_accounts AS (SELECT account_id FROM qa_test_accounts WHERE run_id=$1 UNION SELECT id FROM "Account" WHERE "companyName" LIKE $2 UNION SELECT "accountId" FROM "User" WHERE email LIKE $3), qa_jobs AS (SELECT j.id FROM "Job" j WHERE j."posterId" IN (SELECT account_id FROM qa_accounts) OR j."acceptedById" IN (SELECT account_id FROM qa_accounts) OR j.notes LIKE $2) ';
      const accountRows = await tx.$queryRawUnsafe<Array<{ count: number }>>(
        'WITH qa_accounts AS (SELECT account_id FROM qa_test_accounts WHERE run_id=$1 UNION SELECT id FROM "Account" WHERE "companyName" LIKE $2 UNION SELECT "accountId" FROM "User" WHERE email LIKE $3) SELECT COUNT(DISTINCT account_id)::int AS count FROM qa_accounts',
        runId, marker, emailPattern
      );
      const recoveredAccounts = Number(accountRows[0]?.count || 0);
      await exec("emailTokens", qaAccounts + 'DELETE FROM "EmailVerificationToken" e USING "User" u WHERE e."userId"=u.id AND u."accountId" IN (SELECT account_id FROM qa_accounts)', runId, marker, emailPattern);
      await exec("passwordResetTokens", qaAccounts + 'DELETE FROM "PasswordResetToken" p USING "User" u WHERE p."userId"=u.id AND u."accountId" IN (SELECT account_id FROM qa_accounts)', runId, marker, emailPattern);
      await exec("ratings", qaJobs + 'DELETE FROM "Rating" WHERE "raterId" IN (SELECT account_id FROM qa_accounts) OR "rateeId" IN (SELECT account_id FROM qa_accounts) OR "jobId" IN (SELECT id FROM qa_jobs)', runId, marker, emailPattern);
      await exec("bids", qaJobs + 'DELETE FROM "Bid" WHERE "bidderId" IN (SELECT account_id FROM qa_accounts) OR "jobId" IN (SELECT id FROM qa_jobs)', runId, marker, emailPattern);
      await exec("jobActivities", qaJobs + 'DELETE FROM "JobActivity" WHERE "actorId" IN (SELECT account_id FROM qa_accounts) OR "jobId" IN (SELECT id FROM qa_jobs)', runId, marker, emailPattern);
      await exec("driverOpportunities", qaJobs + 'DELETE FROM "DriverOpportunity" WHERE "driverId" IN (SELECT account_id FROM qa_accounts) OR "jobId" IN (SELECT id FROM qa_jobs)', runId, marker, emailPattern);
      await exec("usageEvents", qaAccounts + 'DELETE FROM "PlatformUsageEvent" WHERE "accountId" IN (SELECT account_id FROM qa_accounts)', runId, marker, emailPattern);
      await exec("subscriptionPayments", qaAccounts + 'DELETE FROM "SubscriptionPayment" WHERE "accountId" IN (SELECT account_id FROM qa_accounts)', runId, marker, emailPattern);
      await exec("verificationAttempts", qaAccounts + 'DELETE FROM "VerificationAttempt" WHERE "accountId" IN (SELECT account_id FROM qa_accounts)', runId, marker, emailPattern);
      await exec("trialCycles", qaAccounts + 'DELETE FROM "TrialCycle" WHERE "accountId" IN (SELECT account_id FROM qa_accounts)', runId, marker, emailPattern);
      await exec("qualificationSnapshots", qaAccounts + 'DELETE FROM "QualificationSnapshot" WHERE "accountId" IN (SELECT account_id FROM qa_accounts)', runId, marker, emailPattern);
      await exec("referrals", qaAccounts + 'DELETE FROM "Referral" WHERE "referrerId" IN (SELECT account_id FROM qa_accounts) OR "referredAccountId" IN (SELECT account_id FROM qa_accounts)', runId, marker, emailPattern);
      await exec("vehicles", qaAccounts + 'DELETE FROM "Vehicle" WHERE "accountId" IN (SELECT account_id FROM qa_accounts)', runId, marker, emailPattern);
      await exec("jobs", qaJobs + 'DELETE FROM "Job" WHERE id IN (SELECT id FROM qa_jobs)', runId, marker, emailPattern);
      await exec("users", qaAccounts + 'DELETE FROM "User" WHERE "accountId" IN (SELECT account_id FROM qa_accounts)', runId, marker, emailPattern);
      await exec("accounts", qaAccounts + 'DELETE FROM "Account" WHERE id IN (SELECT account_id FROM qa_accounts)', runId, marker, emailPattern);
      await exec("apiMetrics", 'DELETE FROM "ApiRequestMetric" WHERE "qaRunId"=$1', runId);
      await exec("accountMappings", 'DELETE FROM qa_test_accounts WHERE run_id=$1', runId);
      if (run.status !== "completed") {
        await tx.$executeRawUnsafe(
          "UPDATE qa_test_runs SET status='aborted', created_accounts=GREATEST(created_accounts,$2), summary=COALESCE(summary,'{}'::jsonb) || jsonb_build_object('status','aborted','cleanupReason','explicitly requested staging synthetic cleanup','recoveredSyntheticAccounts',$2) WHERE id=$1",
          runId, recoveredAccounts
        );
      }
      results.push({ runId, priorStatus: run.status, recoveredSyntheticAccounts: recoveredAccounts, deleted: counts, preservedAuditEvents: true, preservedRunSummary: true });
    }
    return results;
  }, { maxWait: 10000, timeout: 30000 });
}

async function runQA() {
  const base = (process.env.QA_BASE_URL || "").replace(/\/+$/, "");
  const db = process.env.DATABASE_URL || "";
  const countryCode = (process.env.QA_MARKET_COUNTRY || "GB").trim().toUpperCase();
  const market = getMarket(countryCode);
  if (!market) throw new Error("QA_MARKET_COUNTRY must be a supported country code.");
  if (!isQaRunnerEnabled()) {
    throw new Error("QA runner is disabled unless an explicitly allow-listed staging deployment and isolated QA database are configured.");
  }
  if (!base.startsWith("https://") || !db || process.env.QA_ACCOUNT_COUNT !== "500" || process.env.POST2DRIVE_QA_DATABASE_ISOLATED !== "true") throw new Error("QA preflight requires an HTTPS staging target, an explicitly isolated DATABASE_URL and QA_ACCOUNT_COUNT=500.");
  const runId = new Date().toISOString().replace(/[^0-9]/g, "").slice(0, 14) + "-" + crypto.randomUUID();
  const marker = "QA-" + runId;
  const started = Date.now();
  activeRunId = runId;
  lastRunId = runId;
  const events: EventResult[] = [];
  let createdAccounts = 0;
  const fixtures: AccountFixture[] = [];

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
      runId, marker, status, target: base, targetAccounts: 500, country: market.country, currency: market.currency, marketLabel: market.label, createdAccounts, eventCount: events.length,
      passed, failed, durationMs: Date.now() - started, p50Ms: percentile(0.5), p95Ms: percentile(0.95),
      cohorts: { posterFocused: 100, driverFocused: 150, both: 249, restricted: 1 },
      endpoints, syntheticDataRetained: true, realMoneyPaymentsAttempted: false, emailDeliveryTested: false, ...extra,
    };
    await prisma.$executeRawUnsafe(
      "UPDATE qa_test_runs SET status=$2,finished_at=now(),created_accounts=$3,successful_checks=$4,failed_checks=$5,duration_ms=$6,summary=$7::jsonb WHERE id=$1",
      runId, status, createdAccounts, passed, failed, Date.now() - started, JSON.stringify(summary),
    );
    console.log("POST2DRIVE_QA_RESULT " + JSON.stringify(summary));
    return summary;
  }

  await prisma.$executeRawUnsafe(
    "INSERT INTO qa_test_runs(id,target_url,target_accounts,status) VALUES($1,$2,500,'running')",
    runId, base,
  );

  try {
    console.log("Starting staging QA run " + runId + " for " + market.country + "/" + market.currency + " with 500 synthetic accounts at " + base);
    await parallel(Array.from({ length: 500 }, (_, i) => i), 2, async i => {
      const cohort: AccountFixture["cohort"] = i < 100 ? "poster-focused" : i < 250 ? "driver-focused" : i < 499 ? "both" : "restricted";
      const email = "qa-" + runId + "-" + String(i + 1).padStart(3, "0") + "@post2drive.invalid";
      const password = "QA-" + crypto.randomUUID() + "-p2d";
      const payload = {
        name: "QA User " + (i + 1), email, phone: market.dialingCode + "770090" + String(i).padStart(4, "0"),
        password, companyName: "[QA-" + runId + "] " + cohort + " " + String(i + 1).padStart(3, "0"),
        planType: "individual", isSoleTrader: true, country: market.country, currency: market.currency,
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
          const ukPromotion = market.country === "GB" && i !== 499;
          const paidWeeklyMarket = market.country !== "GB" && market.country !== "IN" && i !== 499;
          const accessEndsAt = new Date(Date.now() + 60 * 86400000);
          await tx.account.update({
            where: { id: accountId },
            data: {
              isTester: i !== 499,
              verificationStatus: i === 499 ? "not_started" : "verified",
              verifiedAt: i === 499 ? null : new Date(),
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
    if (createdAccounts !== 500) return await finish("aborted", { reason: "Stopped before workflows because signup did not create exactly 500 accounts.", createdAccounts });

    await parallel(fixtures, 4, async account => {
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
    const restricted = fixtures.find(a => a.index === 499);
    if (restricted?.client && posters[0]) {
      const sample = await createJob(posters[0], 1800, "bid");
      if (sample) await check(restricted.client, restricted, "access-control", market.country === "IN" ? "india-non-weekly-market-access-policy" : "restricted-account-cannot-bid", "POST", "/api/jobs/" + sample + "/bid", { amount: 100 }, market.country === "IN" ? [200] : [403, 402]);
    }

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
    return await finish("completed", { successfulLogins: signed.length, persistedDataSummary, limitations: ["Email delivery and real provider settlements were not attempted.", "This is API-driven lifecycle simulation, not browser-based usability testing.", "Route distances and prices are deterministic synthetic estimates, not live routing results or market quotes."] });
  } catch (error) {
    lastError = error instanceof Error ? error.message : String(error);
    console.error("Staging QA runner exception", error);
    return await finish("failed", { exception: lastError });
  } finally {
    activeRunId = null;
    lastFinishedAt = new Date().toISOString();
  }
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const token = url.searchParams.get("token") || "";
  const confirm = url.searchParams.get("confirm") || "";
  const accounts = url.searchParams.get("accounts") || "";
  const target = url.searchParams.get("target") || "";
  const report = url.searchParams.get("report") || "";
  const expectedToken = process.env.QA_RUN_TOKEN || "";

  // Defense in depth: never expose QA reports/status or start the destructive
  // synthetic-account runner unless this exact deployment is explicitly
  // allow-listed as staging with a separate QA database.
  if (!isQaRunnerEnabled()) {
    return NextResponse.json(
      { error: "QA endpoints are available only on an explicitly allow-listed staging deployment." },
      { status: 404 },
    );
  }

  if (report) {
    if (!expectedToken || token !== expectedToken) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    const runId = url.searchParams.get("runId") || "";
    if (!runId || !/^[A-Za-z0-9._:-]{1,80}$/.test(runId)) return NextResponse.json({ error: "A valid runId is required." }, { status: 400 });
    if (report === "failures") {
      const failures = await prisma.$queryRawUnsafe<Array<{ account_index: number | null; cohort: string | null; scenario: string; action: string; method: string | null; path: string; expected_statuses: number[]; actual_status: number | null; duration_ms: number | null; details: unknown }>>(
        "SELECT account_index,cohort,scenario,action,method,path,expected_statuses,actual_status,duration_ms,details FROM qa_test_events WHERE run_id=$1 AND passed=false ORDER BY id LIMIT 100",
        runId
      );
      return NextResponse.json({ runId, failureCount: failures.length, failures });
    }
    if (report === "summary") {
      const rows = await prisma.$queryRawUnsafe<Array<{ id: string; status: string; target_accounts: number; created_accounts: number; successful_checks: number; failed_checks: number; duration_ms: bigint | null; summary: unknown }>>(
        "SELECT id,status,target_accounts,created_accounts,successful_checks,failed_checks,duration_ms,summary FROM qa_test_runs WHERE id=$1",
        runId
      );
      const run = rows[0];
      // Prisma returns PostgreSQL BIGINT columns as JavaScript bigint values.
      // NextResponse.json cannot serialize bigint, so normalize duration_ms at the API boundary.
      return NextResponse.json({
        runId,
        run: run
          ? {
              ...run,
              duration_ms: run.duration_ms === null ? null : Number(run.duration_ms),
            }
          : null,
      });
    }
    return NextResponse.json({ error: "Unknown report type." }, { status: 400 });
  }
  // One-time, high-entropy trigger for controlled staging automation when POST dispatch is unavailable.
  // Never log or echo the token; rotate QA_RUN_TOKEN immediately after starting the run.
  if (url.searchParams.get("mode") === "status") {
    if (!expectedToken || token !== expectedToken) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    return NextResponse.json({ ok: true, active, activeRunId, lastRunId, lastFinishedAt, lastError: lastError ? "QA run failed; inspect restricted staging logs." : null });
  }
  if (!token) return NextResponse.json({ ok: true, stagingOnly: true });
  if (!expectedToken || token !== expectedToken || accounts !== "500" || target !== "staging" || confirm !== "RUN_500_SYNTHETIC_ACCOUNTS_ON_STAGING") {
    return NextResponse.json({ error: "Unauthorized or invalid staging confirmation." }, { status: 401 });
  }
  if (active) return NextResponse.json({ error: "A QA run is already active.", activeRunId }, { status: 409 });
  active = true;
  lastError = null;
  void runQA().catch(error => {
    lastError = error instanceof Error ? error.message : String(error);
    console.error("QA background task failed", error);
  }).finally(() => { active = false; });
  return NextResponse.json({ accepted: true, target: "staging", accounts: 500 });
}

export async function POST(req: Request) {
  const expectedToken = process.env.QA_RUN_TOKEN || "";
  if (!isQaRunnerEnabled()) {
    return NextResponse.json({ error: "QA actions require an explicitly allow-listed staging deployment and isolated QA database." }, { status: 403 });
  }
  if (!expectedToken || expectedToken.length < 32 || req.headers.get("authorization") !== "Bearer " + expectedToken) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  if (active) return NextResponse.json({ error: "A QA run is already active.", activeRunId }, { status: 409 });
  let body: any;
  try { body = await req.json(); } catch { return NextResponse.json({ error: "JSON body required." }, { status: 400 }); }
  if (body?.action === "cleanup") {
    const base = (process.env.QA_BASE_URL || "").replace(/\/+$/, "");
    const configuredBase = (process.env.QA_BASE_URL || "").replace(/\/+$/, "");
    if (!isQaRunnerEnabled() ||
        process.env.QA_ALLOW_CLEANUP !== "true" || !base.startsWith("https://") ||
        base !== configuredBase || body?.target !== "staging" ||
        body?.confirm !== "CLEAN_OLD_STAGING_QA_RUNS" || !Array.isArray(body?.runIds) ||
        body.runIds.length < 1 || body.runIds.length > 5 ||
        body.runIds.some((id: unknown) => typeof id !== "string" || !/^[A-Za-z0-9._:-]{1,80}$/.test(id))) {
      return NextResponse.json({ error: "Cleanup is restricted to explicitly named completed QA runs in the isolated staging environment." }, { status: 400 });
    }
    try {
      const results = await cleanupSyntheticRuns(body.runIds, base);
      return NextResponse.json({ cleaned: true, target: "staging", results });
    } catch (error) {
      return NextResponse.json({ error: error instanceof Error ? error.message : "Cleanup failed." }, { status: 409 });
    }
  }
  if (body?.target !== "staging" || body?.accounts !== 500 || body?.confirm !== "RUN_500_SYNTHETIC_ACCOUNTS_ON_STAGING") {
    return NextResponse.json({ error: "Explicit staging target, accounts=500 and confirmation token required." }, { status: 400 });
  }
  active = true;
  lastError = null;
  void runQA().catch(error => {
    lastError = error instanceof Error ? error.message : String(error);
    console.error("QA background task failed", error);
  }).finally(() => { active = false; });
  return NextResponse.json({ accepted: true, target: "staging", accounts: 500 }, { status: 202 });
}
