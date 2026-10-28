import { isQaRunnerEnabled } from "@/lib/qaRunnerGuard";
import { timingSafeEqual } from "node:crypto";
import { readBoundedJson } from "@/lib/requestBody";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { getMarket } from "@/lib/market";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 300;

function constantTimeTokenMatches(expected: string, supplied: string) {
  const expectedBytes = Buffer.from(expected, "utf8");
  const suppliedBytes = Buffer.from(supplied, "utf8");
  return expectedBytes.length >= 32 &&
    expectedBytes.length === suppliedBytes.length &&
    timingSafeEqual(expectedBytes, suppliedBytes);
}

async function cleanupSyntheticRuns(runIds: string[], base: string) {
  return prisma.$transaction(async tx => {
    const results: Array<Record<string, unknown>> = [];
    for (const runId of runIds) {
      const runs = await tx.$queryRawUnsafe<Array<{ id: string; target_url: string; status: string; target_accounts: number; created_accounts: number; finished_at: Date | null; duration_ms: bigint | null; summary: unknown }>>(
        "SELECT id,target_url,status,target_accounts,created_accounts,finished_at,duration_ms,summary FROM qa_test_runs WHERE id=$1 FOR UPDATE",
        runId
      );
      const run = runs[0];
      const persistedSummary = run?.summary && typeof run.summary === "object" && !Array.isArray(run.summary)
        ? run.summary as Record<string, unknown>
        : {};
      const allowedStatuses = new Set(["completed", "failed", "aborted"]);
      if (!run || run.target_url !== base || run.target_accounts !== 10_000) {
        throw new Error("Cleanup refused: run must be a named 10,000-account QA run for this exact staging target: " + runId);
      }
      // Locking the ledger row serializes repeated cleanup requests. If an earlier
      // cleanup committed, report its stored counts rather than overwriting them.
      if (persistedSummary.syntheticDataRetained === false && persistedSummary.syntheticDataCleanedAt) {
        results.push({
          runId,
          priorStatus: run.status,
          finalStatus: run.status,
          alreadyCleaned: true,
          recoveredSyntheticAccounts: Number(persistedSummary.recoveredSyntheticAccounts ?? run.created_accounts),
          deleted: persistedSummary.cleanupCounts ?? {},
          preservedAuditEvents: true,
          preservedRunSummary: true,
        });
        continue;
      }
      if (!allowedStatuses.has(run.status)) {
        throw new Error("Cleanup refused: run must be completed, failed, or aborted; queued/running runs are never cleanup eligible: " + runId);
      }
      // A legacy cleanup could change a live run to aborted without finalizing it.
      // Never infer that such a row is safe to delete: require durable completion markers.
      if (!run.finished_at || run.duration_ms === null) {
        throw new Error("Cleanup refused: this terminal row has no complete finish timestamp/duration. Treat it as an interrupted legacy run; verify the worker is stopped and preserve/review evidence before any manual recovery: " + runId);
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
        "UPDATE qa_test_runs SET created_accounts=GREATEST(created_accounts,$2), summary=COALESCE(summary,'{}'::jsonb) || jsonb_build_object('cleanupReason','explicitly requested staging synthetic cleanup','recoveredSyntheticAccounts',$3,'syntheticDataRetained',false,'syntheticDataCleanedAt',now(),'cleanupCounts',$4::jsonb) WHERE id=$1 AND status=$5 AND finished_at IS NOT NULL AND duration_ms IS NOT NULL",
        runId, recoveredAccounts, recoveredAccounts, JSON.stringify(counts), run.status
      );
      results.push({ runId, priorStatus: run.status, finalStatus, recoveredSyntheticAccounts: recoveredAccounts, deleted: counts, preservedAuditEvents: true, preservedRunSummary: true });
    }
    return results;
  }, { maxWait: 30000, timeout: 180000 });
}


type QaTestType = "api-load" | "synthetic-accounts" | "workflow-e2e";

async function enqueueQaRun(country: string, testType: QaTestType) {
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
      runId, base, JSON.stringify({ status: "queued", country, testType, phase: "queued", queuedAt: new Date().toISOString() }),
    );
    return { accepted: true, alreadyActive: false, runId, status: "queued" };
  }, { maxWait: 10000, timeout: 15000 });
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const token = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  const confirm = url.searchParams.get("confirm") || "";
  const requestedType = url.searchParams.get("type") || "workflow-e2e";
  const validType = ["api-load", "synthetic-accounts", "workflow-e2e"].includes(requestedType);
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
    if (!constantTimeTokenMatches(expectedToken, token)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
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
    if (!constantTimeTokenMatches(expectedToken, token)) return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
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
  if (!constantTimeTokenMatches(expectedToken, token) || accounts !== "10000" || target !== "staging" || !validType || confirm !== "RUN_10000_QA_ON_STAGING") {
    return NextResponse.json({ error: "Unauthorized or invalid staging confirmation." }, { status: 401 });
  }
  const requestedCountry = (url.searchParams.get("country") || process.env.QA_MARKET_COUNTRY || "GB").trim().toUpperCase();
  if (!getMarket(requestedCountry)) return NextResponse.json({ error: "Unsupported country code." }, { status: 400 });
  try {
    const queued = await enqueueQaRun(requestedCountry, requestedType as QaTestType);
    if (queued.alreadyActive) {
      return NextResponse.json({ error: "A QA run is already queued or running.", activeRunId: queued.runId, status: queued.status }, { status: 409 });
    }
    return NextResponse.json({ accepted: true, runId: queued.runId, status: "queued", target: "staging", testType: requestedType, accounts: 10_000 }, { status: 202 });
  } catch {
    return NextResponse.json({ error: "Unable to enqueue the QA run; verify the isolated staging worker configuration." }, { status: 503 });
  }
}

export async function POST(req: Request) {
  const expectedToken = process.env.QA_RUN_TOKEN || "";
  if (!isQaRunnerEnabled()) {
    return NextResponse.json({ error: "QA actions require an explicitly allow-listed staging deployment and isolated QA database." }, { status: 403 });
  }
  const providedToken = (req.headers.get("authorization") || "").replace(/^Bearer\s+/i, "");
  if (!constantTimeTokenMatches(expectedToken, providedToken)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }
  const parsedBody = await readBoundedJson(req, 16 * 1024);
  if (!parsedBody.ok) {
    return NextResponse.json(
      { error: parsedBody.status === 413 ? "Request body is too large." : "JSON body required." },
      { status: parsedBody.status },
    );
  }
  if (!parsedBody.value || typeof parsedBody.value !== "object" || Array.isArray(parsedBody.value)) {
    return NextResponse.json({ error: "Request body must be a JSON object." }, { status: 400 });
  }
  const body = parsedBody.value as {
    action?: unknown;
    target?: unknown;
    confirm?: unknown;
    runIds?: unknown;
    country?: unknown;
    testType?: unknown;
    accounts?: unknown;
  };
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
      console.error("Staging QA cleanup failed.", { errorName: error instanceof Error ? error.name : "UnknownError" });
      return NextResponse.json({ error: "Cleanup failed. Confirm that each run is completed and cleanup-eligible." }, { status: 409 });
    }
  }
  const requestedCountry = String(body?.country || process.env.QA_MARKET_COUNTRY || "GB").trim().toUpperCase();
  if (!getMarket(requestedCountry)) return NextResponse.json({ error: "Unsupported country code." }, { status: 400 });
  const testType = typeof body.testType === "string" ? body.testType : "";
  if (body?.target !== "staging" || body?.accounts !== 10_000 || body?.confirm !== "RUN_10000_QA_ON_STAGING" || !["api-load", "synthetic-accounts", "workflow-e2e"].includes(testType)) {
    return NextResponse.json({ error: "Explicit staging target, supported testType, accounts=10000 and confirmation token required." }, { status: 400 });
  }
  try {
    const queued = await enqueueQaRun(requestedCountry, testType as QaTestType);
    if (queued.alreadyActive) {
      return NextResponse.json({ error: "A QA run is already queued or running.", activeRunId: queued.runId, status: queued.status }, { status: 409 });
    }
    return NextResponse.json({ accepted: true, runId: queued.runId, status: "queued", target: "staging", testType, accounts: 10_000 }, { status: 202 });
  } catch {
    return NextResponse.json({ error: "Unable to enqueue the QA run; verify the isolated staging worker configuration." }, { status: 503 });
  }
}
