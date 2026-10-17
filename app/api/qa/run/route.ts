import { isQaRunnerEnabled } from "@/lib/qaRunnerGuard";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getMarket } from "@/lib/market";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

async function cleanupSyntheticRuns(runIds: string[], base: string) {
  return prisma.$transaction(async tx => {
    const results: Array<Record<string, unknown>> = [];
    for (const runId of runIds) {
      const runs = await tx.$queryRawUnsafe<Array<{ id: string; target_url: string; status: string; target_accounts: number; created_accounts: number }>>(
        "SELECT id,target_url,status,target_accounts,created_accounts FROM qa_test_runs WHERE id=$1",
        runId
      );
      const run = runs[0];
      const allowedStatuses = new Set(["completed", "failed", "aborted"]);
      if (!run || !allowedStatuses.has(run.status) || run.target_url !== base || run.target_accounts !== 10_000) {
        throw new Error("Cleanup refused: run must be a completed, failed, or aborted 10,000-account QA run for this exact staging target. Stop or confirm the run is no longer active before cleanup: " + runId);
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
      const finalStatus = run.status;
      await tx.$executeRawUnsafe(
        "UPDATE qa_test_runs SET status=$2, finished_at=COALESCE(finished_at,now()), duration_ms=COALESCE(duration_ms,GREATEST(0,(EXTRACT(EPOCH FROM (now()-(SELECT started_at FROM qa_test_runs WHERE id=$1)))*1000)::bigint)), created_accounts=GREATEST(created_accounts,$3), summary=COALESCE(summary,'{}'::jsonb) || jsonb_build_object('status',$2,'cleanupReason','explicitly requested staging synthetic cleanup','recoveredSyntheticAccounts',$3,'syntheticDataRetained',false,'syntheticDataCleanedAt',now(),'cleanupCounts',$4::jsonb) WHERE id=$1",
        runId, finalStatus, recoveredAccounts, JSON.stringify(counts)
      );
      results.push({ runId, priorStatus: run.status, finalStatus, recoveredSyntheticAccounts: recoveredAccounts, deleted: counts, preservedAuditEvents: true, preservedRunSummary: true });
    }
    return results;
  }, { maxWait: 30000, timeout: 180000 });
}


async function enqueueQaRun(country: string) {
  const base = (process.env.QA_BASE_URL || "").replace(/\/+$/, "");
  const db = process.env.DATABASE_URL || "";
  if (!isQaRunnerEnabled() || !base.startsWith("https://") || !db ||
      process.env.QA_ACCOUNT_COUNT !== "10000" ||
      process.env.POST2DRIVE_QA_DATABASE_ISOLATED !== "true") {
    throw new Error("Queue preflight requires an allow-listed staging deployment and isolated database.");
  }

  const runId = new Date().toISOString().replace(/[^0-9]/g, "").slice(0, 14) + "-" + crypto.randomUUID();
  return prisma.$transaction(async tx => {
    // Serialize request-side checks across web replicas, then enforce one global active run.
    await tx.$queryRawUnsafe<Array<{ locked: number }>>("SELECT 1 AS locked FROM (SELECT pg_advisory_xact_lock(hashtext($1))) AS lock_guard", "post2drive-qa-run-queue");
    const existing = await tx.$queryRawUnsafe<Array<{ id: string; status: string }>>(
      "SELECT id,status FROM qa_test_runs WHERE status IN ('queued','running') ORDER BY started_at DESC LIMIT 1"
    );
    if (existing[0]) {
      return { accepted: false, alreadyActive: true, runId: existing[0].id, status: existing[0].status };
    }

    await tx.$executeRawUnsafe(
      "INSERT INTO qa_test_runs(id,target_url,target_accounts,status,summary) VALUES($1,$2,10000,'queued',$3::jsonb)",
      runId, base, JSON.stringify({ status: "queued", country, phase: "queued", queuedAt: new Date().toISOString() }),
    );
    return { accepted: true, alreadyActive: false, runId, status: "queued" };
  }, { maxWait: 10000, timeout: 15000 });
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
  // Never log or echo the token; rotate QA_RUN_TOKEN after the run and its preserved report have been retrieved.
  if (url.searchParams.get("mode") === "status") {
    if (!expectedToken || token !== expectedToken) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
    try {
      const [activeRows, latestRows] = await Promise.all([
        prisma.$queryRawUnsafe<Array<{ id: string; status: string; started_at: Date; target_accounts: number; created_accounts: number; successful_checks: number; failed_checks: number; summary: unknown }>>(
          "SELECT id,status,started_at,target_accounts,created_accounts,successful_checks,failed_checks,summary FROM qa_test_runs WHERE status IN ('queued','running') ORDER BY started_at DESC LIMIT 1"
        ),
        prisma.$queryRawUnsafe<Array<{ id: string; status: string; started_at: Date; finished_at: Date | null; target_accounts: number; created_accounts: number; successful_checks: number; failed_checks: number; duration_ms: bigint | null; summary: unknown }>>(
          "SELECT id,status,started_at,finished_at,target_accounts,created_accounts,successful_checks,failed_checks,duration_ms,summary FROM qa_test_runs ORDER BY started_at DESC LIMIT 1"
        )
      ]);
      const activeRun = activeRows[0] ?? null;
      const latest = latestRows[0] ?? null;
      const serialise = (row: any) => row ? {
        ...row,
        started_at: row.started_at instanceof Date ? row.started_at.toISOString() : row.started_at,
        finished_at: row.finished_at instanceof Date ? row.finished_at.toISOString() : row.finished_at,
        duration_ms: row.duration_ms === null || row.duration_ms === undefined ? null : Number(row.duration_ms)
      } : null;
      return NextResponse.json({
        ok: true,
        active: Boolean(activeRun),
        activeRunId: activeRun?.id ?? null,
        persistedActiveRun: serialise(activeRun),
        persistedRunningRun: activeRun?.status === "running" ? serialise(activeRun) : null,
        lastRunId: latest?.id ?? null,
        lastFinishedAt: latest?.finished_at ?? null,
        latestRun: serialise(latest),
        lastError: null
      });
    } catch {
      return NextResponse.json({ error: "Unable to read durable QA run status." }, { status: 503 });
    }
  }
  if (!token) return NextResponse.json({ ok: true, stagingOnly: true });
  if (!expectedToken || token !== expectedToken || accounts !== "10000" || target !== "staging" || confirm !== "RUN_10000_SYNTHETIC_ACCOUNTS_ON_STAGING") {
    return NextResponse.json({ error: "Unauthorized or invalid staging confirmation." }, { status: 401 });
  }
  const requestedCountry = (url.searchParams.get("country") || process.env.QA_MARKET_COUNTRY || "GB").trim().toUpperCase();
  if (!getMarket(requestedCountry)) return NextResponse.json({ error: "Unsupported country code." }, { status: 400 });
  try {
    const queued = await enqueueQaRun(requestedCountry);
    if (queued.alreadyActive) {
      return NextResponse.json({ error: "A QA run is already queued or running.", activeRunId: queued.runId, status: queued.status }, { status: 409 });
    }
    return NextResponse.json({ accepted: true, runId: queued.runId, status: "queued", target: "staging", accounts: 10_000 }, { status: 202 });
  } catch {
    return NextResponse.json({ error: "Unable to enqueue the QA run; verify the isolated staging worker configuration." }, { status: 503 });
  }
}

export async function POST(req: Request) {
  const expectedToken = process.env.QA_RUN_TOKEN || "";
  if (!isQaRunnerEnabled()) {
    return NextResponse.json({ error: "QA actions require an explicitly allow-listed staging deployment and isolated QA database." }, { status: 403 });
  }
  if (!expectedToken || expectedToken.length < 32 || req.headers.get("authorization") !== "Bearer " + expectedToken) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
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
  const requestedCountry = String(body?.country || process.env.QA_MARKET_COUNTRY || "GB").trim().toUpperCase();
  if (!getMarket(requestedCountry)) return NextResponse.json({ error: "Unsupported country code." }, { status: 400 });
  if (body?.target !== "staging" || body?.accounts !== 10_000 || body?.confirm !== "RUN_10000_SYNTHETIC_ACCOUNTS_ON_STAGING") {
    return NextResponse.json({ error: "Explicit staging target, accounts=10000 and confirmation token required." }, { status: 400 });
  }
  try {
    const queued = await enqueueQaRun(requestedCountry);
    if (queued.alreadyActive) {
      return NextResponse.json({ error: "A QA run is already queued or running.", activeRunId: queued.runId, status: queued.status }, { status: 409 });
    }
    return NextResponse.json({ accepted: true, runId: queued.runId, status: "queued", target: "staging", accounts: 10_000 }, { status: 202 });
  } catch {
    return NextResponse.json({ error: "Unable to enqueue the QA run; verify the isolated staging worker configuration." }, { status: 503 });
  }
}
