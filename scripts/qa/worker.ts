#!/usr/bin/env node
// Run as a separate Railway worker service (one process per service instance).
// Claims jobs atomically in PostgreSQL. A crashed worker leaves a visible running
// record with its last heartbeat; it is never silently re-queued while the old
// process might still be alive. Operators must confirm the old process is stopped
// before explicitly recovering or cleaning an interrupted run.
import { hostname } from "node:os";
import { randomUUID } from "node:crypto";
import { setTimeout as sleep } from "node:timers/promises";
// @ts-expect-error Native Node type stripping needs explicit TypeScript extensions.
import { prisma } from "../../lib/prisma.ts";
// @ts-expect-error Native Node type stripping needs explicit TypeScript extensions.
import { isQaRunnerEnabled } from "../../lib/qaRunnerGuard.ts";
// @ts-expect-error Native Node type stripping needs explicit TypeScript extensions.
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
       WHERE status = 'queued' AND target_accounts = 10000
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
  return rows[0] ?? null;
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

async function executeRun(job: { id: string; summary: unknown; target_url: string; target_accounts: number }) {
  if (job.target_url !== (process.env.QA_BASE_URL || "").replace(/\/+$/, "") || job.target_accounts !== 10000) {
    await markWorkerFailure(job.id);
    throw new Error("Claimed QA run did not match worker target/count.");
  }
  const summary = (job.summary && typeof job.summary === "object") ? job.summary as Record<string, unknown> : {};
  const country = typeof summary.country === "string" ? summary.country : (process.env.QA_MARKET_COUNTRY || "GB");
  const stopHeartbeat = startHeartbeat(job.id);
  activeJob = true;
  try {
    const result = await runQaWorker(job.id, country);
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
