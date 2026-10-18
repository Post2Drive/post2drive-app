#!/usr/bin/env node
// Run as a separate Railway worker service (one process per service instance).
// Claims jobs atomically in PostgreSQL. A crashed worker leaves a visible running
// record with its last heartbeat; it is never silently re-queued while the old
// process might still be alive. Operators must confirm the old process is stopped
// before explicitly recovering or cleaning an interrupted run.
import { hostname } from "node:os";
import { randomUUID } from "node:crypto";
import { setTimeout as sleep } from "node:timers/promises";
import { prisma } from "../../lib/prisma.ts";
import { isQaRunnerEnabled } from "../../lib/qaRunnerGuard.ts";
import { runQaWorker } from "../../lib/qaRunner.ts";

const POLL_MS = Number(process.env.QA_WORKER_POLL_MS || 5000);
const HEARTBEAT_MS = Number(process.env.QA_WORKER_HEARTBEAT_MS || 15000);
const workerId = `${hostname()}-${process.pid}-${randomUUID()}`;
let stopping = false;
let activeJob = false;

process.on("SIGTERM", () => { stopping = true; console.log("QA worker received SIGTERM; no new jobs will be claimed."); });
process.on("SIGINT", () => { stopping = true; console.log("QA worker received SIGINT; no new jobs will be claimed."); });

function validateWorkerConfig() {
  if (!isQaRunnerEnabled()) throw new Error("QA worker refuses to start outside the explicitly allow-listed staging environment.");
  if (process.env.QA_ACCOUNT_COUNT !== "10000" || process.env.POST2DRIVE_QA_DATABASE_ISOLATED !== "true" ||
      !process.env.DATABASE_URL || !process.env.QA_BASE_URL?.startsWith("https://")) {
    throw new Error("QA worker requires an isolated staging database, HTTPS target and QA_ACCOUNT_COUNT=10000.");
  }
}

async function claimNextRun() {
  const rows = await prisma.$queryRawUnsafe<Array<{ id: string; summary: unknown; target_url: string; target_accounts: number }>>(
    `WITH candidate AS (
       SELECT id
       FROM qa_test_runs
       WHERE status = 'queued' AND target_accounts BETWEEN 500 AND 10000
       ORDER BY started_at ASC
       LIMIT 1
       FOR UPDATE SKIP LOCKED
     )
     UPDATE qa_test_runs AS run
     SET status = 'running',
         started_at = now(),
         summary = COALESCE(run.summary, '{}'::jsonb) ||
           jsonb_build_object('status','running','phase','claimed','workerId',$1,'workerClaimedAt',now(),'workerHeartbeatAt',now())
     FROM candidate
     WHERE run.id = candidate.id
     RETURNING run.id,run.summary,run.target_url,run.target_accounts`,
    workerId,
  );
  const claimed = rows[0] ?? null;
  const summary = claimed?.summary && typeof claimed.summary === "object" ? claimed.summary as Record<string, unknown> : {};
  if (claimed && typeof summary.campaignStepId === "string" && typeof summary.campaignId === "string") {
    await prisma.$executeRawUnsafe(
      "UPDATE qa_test_campaign_steps SET status='running',started_at=COALESCE(started_at,now()) WHERE id=$1 AND campaign_id=$2 AND run_id=$3 AND status='queued'",
      summary.campaignStepId, summary.campaignId, claimed.id
    );
  }
  return claimed;
}

function startHeartbeat(runId: string) {
  let busy = false;
  const timer = setInterval(async () => {
    if (busy) return;
    busy = true;
    try {
      const count = await prisma.$executeRawUnsafe(
        `UPDATE qa_test_runs
         SET summary = COALESCE(summary, '{}'::jsonb) ||
           jsonb_build_object('workerHeartbeatAt',now(),'phase','executing')
         WHERE id=$1 AND status='running' AND summary->>'workerId'=$2`,
        runId, workerId,
      );
      if (Number(count) === 0) console.error("QA worker lost its active-run lease marker for run " + runId);
    } catch (error) {
      console.error("QA worker heartbeat update failed for run " + runId, error instanceof Error ? error.message : String(error));
    } finally {
      busy = false;
    }
  }, HEARTBEAT_MS);
  timer.unref();
  return () => clearInterval(timer);
}

async function markWorkerFailure(runId: string) {
  await prisma.$executeRawUnsafe(
    `UPDATE qa_test_runs
     SET status='failed',
         finished_at=COALESCE(finished_at,now()),
         duration_ms=COALESCE(duration_ms,GREATEST(0,(EXTRACT(EPOCH FROM (now()-started_at))*1000)::bigint)),
         summary=COALESCE(summary,'{}'::jsonb) ||
           jsonb_build_object('status','failed','phase','worker-failed','workerFailedAt',now(),
             'workerFailure','Worker could not finalize this run; inspect restricted worker logs.')
     WHERE id=$1 AND status='running' AND summary->>'workerId'=$2`,
    runId, workerId,
  );
}

async function advanceCampaign(runId: string) {
  await prisma.$transaction(async tx => {
    await tx.$queryRawUnsafe("SELECT pg_advisory_xact_lock(hashtext($1))", "post2drive-qa-run-queue");
    const rows = await tx.$queryRawUnsafe<Array<{ status: string; summary: unknown }>>(
      "SELECT status,summary FROM qa_test_runs WHERE id=$1 FOR UPDATE", runId
    );
    const run = rows[0];
    const summary = run?.summary && typeof run.summary === "object" ? run.summary as Record<string, unknown> : {};
    const campaignId = typeof summary.campaignId === "string" ? summary.campaignId : "";
    const stepId = typeof summary.campaignStepId === "string" ? summary.campaignStepId : "";
    if (!run || !campaignId || !stepId) return;
    const campaigns = await tx.$queryRawUnsafe<Array<{ id: string; status: string }>>(
      "SELECT id,status FROM qa_test_campaigns WHERE id=$1 FOR UPDATE", campaignId
    );
    if (!campaigns[0] || !["queued","running"].includes(campaigns[0].status)) return;
    const terminal = ["completed","failed","aborted"].includes(run.status) ? run.status : "failed";
    await tx.$executeRawUnsafe(
      "UPDATE qa_test_campaign_steps SET status=$3,finished_at=now() WHERE id=$1 AND campaign_id=$2 AND run_id=$4 AND status IN ('queued','running')",
      stepId, campaignId, terminal, runId
    );
    const completedStep = await tx.$queryRawUnsafe<Array<{ suite: string }>>(
      "SELECT suite FROM qa_test_campaign_steps WHERE id=$1", stepId
    );
    if (terminal !== "completed" && completedStep[0]?.suite === "provisioning") {
      await tx.$executeRawUnsafe(
        "UPDATE qa_test_campaign_steps SET status='skipped',finished_at=now() WHERE campaign_id=$1 AND status='pending'", campaignId
      );
      await tx.$executeRawUnsafe("UPDATE qa_test_campaigns SET status='failed',updated_at=now() WHERE id=$1", campaignId);
      return;
    }
    const nextRows = await tx.$queryRawUnsafe<Array<{ id: string; ordinal: number; variation_id: string | null; variation_name: string | null; suite: string; test_type: string; test_iterations: number; account_count: number; concurrency: number; country_code: string; target_environment: string }>>(
      `SELECT s.id,s.ordinal,s.variation_id,s.variation_name,s.suite,s.test_type,s.test_iterations,s.account_count,s.concurrency,
              c.country_code,c.target_environment
       FROM qa_test_campaign_steps s JOIN qa_test_campaigns c ON c.id=s.campaign_id
       WHERE s.campaign_id=$1 AND s.status='pending' ORDER BY s.ordinal ASC LIMIT 1 FOR UPDATE OF s`,
      campaignId
    );
    if (!nextRows[0]) {
      const failures = await tx.$queryRawUnsafe<Array<{ count: number }>>(
        "SELECT count(*)::int AS count FROM qa_test_campaign_steps WHERE campaign_id=$1 AND status IN ('failed','aborted')", campaignId
      );
      await tx.$executeRawUnsafe(
        "UPDATE qa_test_campaigns SET status=$2,updated_at=now() WHERE id=$1",
        campaignId, Number(failures[0]?.count ?? 0) > 0 ? "failed" : "completed"
      );
      return;
    }
    const next = nextRows[0];
    const active = await tx.$queryRawUnsafe<Array<{ id: string }>>(
      "SELECT id FROM qa_test_runs WHERE status IN ('queued','running') AND id<>$1 LIMIT 1", runId
    );
    if (active[0]) throw new Error("Cannot advance QA campaign while another QA run is active.");
    const nextRunId = new Date().toISOString().replace(/[^0-9]/g, "").slice(0, 14) + "-" + randomUUID();
    const runSummary = {
      status: "queued", phase: "queued", country: next.country_code, testType: next.test_type,
      testIterations: next.test_iterations, accountCount: next.account_count, concurrency: next.concurrency,
      campaignId, campaignStepId: next.id, variationId: next.variation_id, variationName: next.variation_name,
      suite: next.suite, queuedAt: new Date().toISOString(), targetEnvironment: next.target_environment,
    };
    await tx.$executeRawUnsafe(
      "INSERT INTO qa_test_runs(id,target_url,target_accounts,status,summary) VALUES($1,$2,$3,'queued',$4::jsonb)",
      nextRunId, (process.env.QA_BASE_URL || "").replace(/\/+$/, ""), next.account_count, JSON.stringify(runSummary)
    );
    await tx.$executeRawUnsafe(
      "UPDATE qa_test_campaign_steps SET status='queued',run_id=$2,started_at=now() WHERE id=$1 AND status='pending'",
      next.id, nextRunId
    );
    await tx.$executeRawUnsafe("UPDATE qa_test_campaigns SET status='running',updated_at=now() WHERE id=$1", campaignId);
  }, { maxWait: 15000, timeout: 30000 });
}

async function executeRun(job: { id: string; summary: unknown; target_url: string; target_accounts: number }) {
  if (job.target_url !== (process.env.QA_BASE_URL || "").replace(/\/+$/, "") || job.target_accounts < 500 || job.target_accounts > 10000) {
    await markWorkerFailure(job.id);
    throw new Error("Claimed QA run did not match worker target/count.");
  }
  const summary = (job.summary && typeof job.summary === "object") ? job.summary as Record<string, unknown> : {};
  const country = typeof summary.country === "string" ? summary.country : (process.env.QA_MARKET_COUNTRY || "GB");
  const testType = summary.testType === "api-load" || summary.testType === "synthetic-accounts" || summary.testType === "workflow-e2e" ? summary.testType : "workflow-e2e";
  const config = {
    accountCount: Number.isInteger(summary.accountCount) ? Number(summary.accountCount) : job.target_accounts,
    testIterations: Number.isInteger(summary.testIterations) ? Number(summary.testIterations) : 10_000,
    concurrency: Number.isInteger(summary.concurrency) ? Number(summary.concurrency) : 12,
    campaignId: typeof summary.campaignId === "string" ? summary.campaignId : undefined,
    variationId: typeof summary.variationId === "string" ? summary.variationId : undefined,
    variationName: typeof summary.variationName === "string" ? summary.variationName : undefined,
    suite: typeof summary.suite === "string" ? summary.suite : undefined,
  };
  const stopHeartbeat = startHeartbeat(job.id);
  activeJob = true;
  try {
    const result = await runQaWorker(job.id, country, workerId, testType, config);
    await prisma.$executeRawUnsafe(
      `UPDATE qa_test_runs
       SET summary=COALESCE(summary,'{}'::jsonb) ||
         jsonb_build_object('workerId',$2,'workerCompletedAt',now(),'workerOutcome',$3)
       WHERE id=$1 AND status IN ('completed','failed','aborted') AND summary->>'workerId'=$2`,
      job.id, workerId, String((result as any)?.status || "unknown"),
    );
  } catch (error) {
    await markWorkerFailure(job.id).catch(markError => console.error("QA worker could not persist failure for run " + job.id, markError));
    console.error("QA worker execution failed for run " + job.id, error instanceof Error ? error.message : String(error));
  }
  try {
    await advanceCampaign(job.id);
  } catch (error) {
    console.error("QA campaign could not advance after run " + job.id, error instanceof Error ? error.message : String(error));
  } finally {
    stopHeartbeat();
    activeJob = false;
  }
}

async function main() {
  validateWorkerConfig();
  console.log("Post2Drive staging QA worker started", JSON.stringify({ workerId, pollMs: POLL_MS, heartbeatMs: HEARTBEAT_MS }));
  while (!stopping) {
    try {
      const job = await claimNextRun();
      if (job) {
        await executeRun(job);
        continue;
      }
    } catch (error) {
      console.error("QA worker poll/claim failed", error instanceof Error ? error.message : String(error));
    }
    await sleep(POLL_MS);
  }
  if (activeJob) {
    console.log("Worker shutdown requested while a run is active; current run must finish or be treated as interrupted if the platform terminates this process.");
  }
  await prisma.$disconnect();
}

main().catch(async error => {
  console.error("QA worker failed to start", error instanceof Error ? error.message : String(error));
  await prisma.$disconnect().catch(() => {});
  process.exitCode = 1;
});
