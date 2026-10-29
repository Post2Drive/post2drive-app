import { createHash, createHmac, randomBytes, randomUUID, timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { withApiMetrics } from "@/lib/apiMetrics";
import { prisma } from "@/lib/prisma";
import { getPromotion, calculatePromotionalEnd } from "@/lib/promotion";
import { emailVerificationEnabled } from "@/lib/emailVerification";
import { getMarket } from "@/lib/market";
import { isQaRunnerEnabled } from "@/lib/qaRunnerGuard";
import { readBoundedText } from "@/lib/requestBody";

const ALLOWED_OUTCOMES = new Set([
  "resume", "reassign", "return_goods", "terminate_with_incident",
  "delivery_dispute", "payment_dispute", "no_further_action",
]);
const ALLOWED_TERMINATION_REASONS = new Set([
  "vehicle_breakdown", "health_emergency", "wrong_load", "unsafe_load",
  "accident", "delay", "pickup_problem", "delivery_damage", "other",
]);

function constantTimeHexEqual(a: string, b: string) {
  if (!/^[a-f0-9]+$/i.test(a) || !/^[a-f0-9]+$/i.test(b)) return false;
  const left = Buffer.from(a, "hex");
  const right = Buffer.from(b, "hex");
  return left.length === right.length && left.length > 0 && timingSafeEqual(left, right);
}

async function authenticateBridge(req: Request, rawBody: string) {
  const secret = process.env.OPS_DASHBOARD_BRIDGE_SECRET;
  if (!secret || secret.length < 32) return { ok: false as const, status: 503, error: "Admin bridge is not configured." };
  const timestamp = req.headers.get("x-p2d-admin-timestamp") || "";
  const nonce = req.headers.get("x-p2d-admin-nonce") || "";
  const signature = req.headers.get("x-p2d-admin-signature") || "";
  const issued = Number(timestamp);
  if (!/^\d{13}$/.test(timestamp) || !Number.isFinite(issued) || Math.abs(Date.now() - issued) > 120_000) {
    return { ok: false as const, status: 401, error: "Invalid or expired admin request." };
  }
  if (!/^[a-f0-9]{32}$/i.test(nonce)) return { ok: false as const, status: 401, error: "Invalid admin request nonce." };
  const expected = createHmac("sha256", secret).update(timestamp + "." + nonce + "." + rawBody).digest("hex");
  if (!constantTimeHexEqual(signature, expected)) return { ok: false as const, status: 401, error: "Invalid admin request signature." };
  try {
    const now = new Date();
    await prisma.rateLimitBucket.deleteMany({
      where: { key: { startsWith: "ops-admin-bridge:" }, expiresAt: { lt: now } },
    });
    await prisma.rateLimitBucket.create({
      data: {
        key: "ops-admin-bridge:" + createHash("sha256").update(nonce).digest("hex"),
        count: 1,
        expiresAt: new Date(now.getTime() + 10 * 60 * 1000),
      },
    });
  } catch (error) {
    if ((error as { code?: string })?.code === "P2002") {
      return { ok: false as const, status: 409, error: "This admin request has already been used." };
    }
    return { ok: false as const, status: 503, error: "Admin replay protection is unavailable." };
  }
  return { ok: true as const };
}

async function handler(req: Request) {
  const boundedBody = await readBoundedText(req, 24_000);
  if (!boundedBody.ok) {
    return NextResponse.json(
      { error: boundedBody.status === 413 ? "Request too large." : "Request body must be valid UTF-8." },
      { status: boundedBody.status },
    );
  }
  const rawBody = boundedBody.text;
  const auth = await authenticateBridge(req, rawBody);
  if (!auth.ok) return NextResponse.json({ error: auth.error }, { status: auth.status });

  let body: any;
  try { body = JSON.parse(rawBody); }
  catch { return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 }); }

  const actor = typeof body?.actor === "string" && /^[a-zA-Z0-9._@-]{3,100}$/.test(body.actor)
    ? body.actor
    : "standalone-admin";
  const action = typeof body?.action === "string" ? body.action : "";

  if (action === "tester-generate-code") {
    const requestedCount = body?.count === undefined ? 1 : Number(body.count);
    if (!Number.isInteger(requestedCount) || requestedCount < 1 || requestedCount > 100) {
      return NextResponse.json({ error: "Generate between 1 and 100 one-time tester codes." }, { status: 400 });
    }
    const codes = Array.from({ length: requestedCount }, () =>
      "P2D-" + randomBytes(2).toString("hex").toUpperCase() + "-" + randomBytes(2).toString("hex").toUpperCase() + "-" + randomBytes(2).toString("hex").toUpperCase()
    );
    const createdAt = new Date();
    await prisma.$transaction(async tx => {
      await tx.testerAccessCode.createMany({
        data: codes.map(rawCode => ({ codeHash: createHash("sha256").update(rawCode).digest("hex") })),
      });
      await tx.adminAuditEvent.create({
        data: {
          actor,
          action: "tester_access_codes_generated",
          entityType: "tester_access_code_batch",
          details: { codePrefix: "P2D", count: requestedCount, plaintextStored: false },
        },
      });
    });
    return NextResponse.json({
      success: true,
      count: codes.length,
      code: codes[0],
      codes,
      createdAt: createdAt.toISOString(),
    }, { status: 201 });
  }

  if (action === "tester-approve" || action === "tester-reject") {
    const accountId = typeof body?.accountId === "string" ? body.accountId : "";
    const decisionReason = typeof body?.reason === "string" ? body.reason.trim() : "";
    if (!accountId || accountId.length > 128) return NextResponse.json({ error: "A valid account ID is required." }, { status: 400 });
    if (!decisionReason || decisionReason.length > 1000) return NextResponse.json({ error: "A review reason is required and must be at most 1000 characters." }, { status: 400 });
    const account = await prisma.account.findUnique({
      where: { id: accountId },
      include: { vehicles: { select: { id: true } }, users: { select: { emailVerifiedAt: true } } },
    });
    if (!account || account.testerApprovalStatus !== "pending") return NextResponse.json({ error: "This tester application is no longer pending." }, { status: 409 });
    const market = account.country;
    if (action === "tester-reject") {
      const result = await prisma.$transaction(async tx => {
        const changed = await tx.account.updateMany({
          where: { id: accountId, testerApprovalStatus: "pending" },
          data: { testerApprovalStatus: "rejected", isTester: false },
        });
        if (changed.count !== 1) return false;
        await tx.adminAuditEvent.create({ data: { actor, action: "tester_application_rejected", entityType: "account", entityId: accountId, market, details: { decision: "rejected", reason: decisionReason } } });
        return true;
      });
      if (!result) return NextResponse.json({ error: "This application has already been reviewed." }, { status: 409 });
      return NextResponse.json({ success: true, decision: "rejected" });
    }
    if (account.vehicles.length === 0) return NextResponse.json({ error: "The applicant must submit at least one vehicle before tester approval." }, { status: 409 });
    if (emailVerificationEnabled() && account.users.some(user => !user.emailVerifiedAt)) return NextResponse.json({ error: "The tester must verify their email before approval." }, { status: 409 });
    if (account.country !== "GB" || account.currency !== "GBP") return NextResponse.json({ error: "Tester approval is only available for GB + GBP accounts." }, { status: 400 });
    const promotion = await getPromotion();
    const now = new Date();
    if (!promotion.active || now < promotion.startAt || now > promotion.endAt) return NextResponse.json({ error: "The UK promotion is not active, so a tester trial cannot be started." }, { status: 409 });
    const freeEndsAt = await calculatePromotionalEnd({
      country: account.country, currency: account.currency, planType: account.planType,
      trialStartedAt: now, freeMonthsEarned: 0,
    });
    if (!freeEndsAt) return NextResponse.json({ error: "Unable to calculate the promotional end date." }, { status: 500 });
    const result = await prisma.$transaction(async tx => {
      const changed = await tx.account.updateMany({
        where: { id: accountId, testerApprovalStatus: "pending", isTester: false },
        data: {
          testerApprovalStatus: "approved", isTester: true, promotionParticipant: true,
          trialStartedAt: now, trialEndsAt: freeEndsAt, freeEndsAt, freeMonthsEarned: 0,
          extensionCount: 0, subscriptionStatus: "promotional", lastActivityAt: now, inactiveSince: null,
        },
      });
      if (changed.count !== 1) return false;
      await tx.adminAuditEvent.create({ data: { actor, action: "tester_application_approved", entityType: "account", entityId: accountId, market, details: { decision: "approved", reason: decisionReason, trialEndsAt: freeEndsAt.toISOString() } } });
      return true;
    });
    if (!result) return NextResponse.json({ error: "This application has already been reviewed." }, { status: 409 });
    return NextResponse.json({ success: true, decision: "approved", freeEndsAt });
  }

  if (action === "incident-resolve") {
    const jobId = typeof body?.jobId === "string" ? body.jobId : "";
    const incidentId = typeof body?.incidentId === "string" ? body.incidentId : "";
    const outcome = typeof body?.outcome === "string" ? body.outcome : "";
    const notes = typeof body?.notes === "string" ? body.notes.trim() : "";
    if (!jobId || !incidentId) return NextResponse.json({ error: "jobId and incidentId are required." }, { status: 400 });
    if (!ALLOWED_OUTCOMES.has(outcome)) return NextResponse.json({ error: "Choose a supported incident outcome." }, { status: 400 });
    if (!notes || notes.length > 4000) return NextResponse.json({ error: "Resolution notes are required and must be at most 4000 characters." }, { status: 400 });
    const incident = await prisma.jobActivity.findFirst({
      where: { id: incidentId, jobId, action: "INCIDENT_REPORTED" },
      select: { id: true, metadata: true },
    });
    if (!incident) return NextResponse.json({ error: "Incident report not found for this job." }, { status: 404 });
    const job = await prisma.job.findUnique({
      where: { id: jobId },
      select: { id: true, status: true, posterId: true, acceptedById: true, pickupConfirmedById: true, deliveryMarkedById: true, poster: { select: { country: true } } },
    });
    if (!job) return NextResponse.json({ error: "Job not found." }, { status: 404 });
    const reason = (incident.metadata as any)?.reason;
    if (outcome === "terminate_with_incident") {
      if (typeof reason !== "string" || !ALLOWED_TERMINATION_REASONS.has(reason)) return NextResponse.json({ error: "This incident type is not eligible for termination; preserve the job history and use the dispute workflow." }, { status: 409 });
      if (job.status !== "accepted" && job.status !== "in_transit") return NextResponse.json({ error: "Only an accepted or in-transit job can be terminated through an incident resolution." }, { status: 409 });
    }
    const resolvedAt = new Date();
    const result = await prisma.$transaction(async tx => {
      let finalStatus = job.status;
      let lifecycleChanged = false;
      if (outcome === "terminate_with_incident") {
        const transition = await tx.job.updateMany({
          where: { id: jobId, status: job.status, posterId: job.posterId, acceptedById: job.acceptedById },
          data: { status: "cancelled", cancelledById: null, cancelledAt: resolvedAt },
        });
        if (transition.count !== 1) return null;
        await tx.bid.updateMany({ where: { jobId, status: "active" }, data: { status: "invalidated" } });
        finalStatus = "cancelled";
        lifecycleChanged = true;
        await tx.jobActivity.create({
          data: {
            jobId, actorId: null, action: "JOB_TERMINATED_WITH_INCIDENT", fromStatus: job.status, toStatus: "cancelled",
            description: "Support terminated the job through the standalone admin incident workflow.",
            metadata: { schemaVersion: 1, incidentId, reason, notes, terminatedByRole: "standalone_admin", terminatedAt: resolvedAt.toISOString(), pickupHistoryPreserved: Boolean(job.pickupConfirmedById), deliveryHistoryPreserved: Boolean(job.deliveryMarkedById), cancellationLimitBypassedForSafetyIncident: true },
          },
        });
      }
      const resolution = await tx.jobActivity.create({
        data: {
          jobId, actorId: null, action: "INCIDENT_RESOLUTION_RECORDED", fromStatus: job.status, toStatus: finalStatus,
          description: "Standalone admin recorded incident resolution: " + outcome.replaceAll("_", " ") + ".",
          metadata: { schemaVersion: 2, parentIncidentId: incidentId, outcome, notes, resolvedAt: resolvedAt.toISOString(), lifecycleStatusAtResolution: finalStatus, lifecycleChanged, execution: outcome === "terminate_with_incident" ? "Job was conditionally terminated; active bids were invalidated." : "Decision recorded only; recovery/reassignment/commercial arrangements remain manual." },
        },
      });
      const recipients = [...new Set([job.posterId, job.acceptedById].filter((value): value is string => Boolean(value)))];
      for (const recipientId of recipients) {
        await tx.notification.create({
          data: {
            accountId: recipientId, type: "incident_resolution",
            title: outcome === "terminate_with_incident" ? "Support terminated the job due to an incident" : "Support recorded an incident decision",
            body: outcome === "terminate_with_incident" ? "Support terminated job " + jobId + " through the incident workflow. Previous milestones remain in activity history." : "Support recorded a decision for the incident on job " + jobId + ". Review the incident history for next steps.",
            jobId, eventKey: "incident-resolution:" + resolution.id + ":" + recipientId,
            metadata: { incidentId, resolutionId: resolution.id, outcome, lifecycleChanged },
          },
        });
      }
      await tx.adminAuditEvent.create({ data: { actor, action: "incident_resolution_recorded", entityType: "incident", entityId: incidentId, market: job.poster.country, details: { jobId, outcome, notes, lifecycleChanged, finalStatus, notificationRecipients: recipients.length } } });
      return { resolution, finalStatus, lifecycleChanged };
    });
    if (!result) return NextResponse.json({ error: "The job status changed while this decision was being processed. Refresh and review before retrying." }, { status: 409 });
    return NextResponse.json({ success: true, resolution: result.resolution, jobStatus: result.finalStatus, lifecycleChanged: result.lifecycleChanged }, { status: 201 });
  }


  if (action === "qa-campaign-create") {
    const name = typeof body?.name === "string" ? body.name.trim().slice(0, 120) : "";
    const countryCode = typeof body?.countryCode === "string" ? body.countryCode.trim().toUpperCase() : "";
    const scenario = typeof body?.scenario === "string" ? body.scenario.trim().slice(0, 120) : "";
    const totalTests = Number(body?.totalTests);
    const accountCount = Number(body?.accountCount);
    const concurrency = Number(body?.concurrency);
    const allowedSuites = new Set(["provisioning", "api", "workflow", "regression", "localization", "failure"]);
    const suites: string[] = Array.isArray(body?.suites) ? Array.from(new Set<string>((body.suites as unknown[]).filter((s: unknown): s is string => typeof s === "string" && allowedSuites.has(s)))) : [];
    const market = getMarket(countryCode);
    if (!name || !scenario || !market) return NextResponse.json({ error: "Enter a campaign name, scenario, and supported market." }, { status: 400 });
    if (!Number.isInteger(totalTests) || totalTests < 1 || totalTests > 25000) return NextResponse.json({ error: "Enter 1 to 25,000 tests." }, { status: 400 });
    if (!Number.isInteger(accountCount) || accountCount < 500 || accountCount > 10000) return NextResponse.json({ error: "Enter 500 to 10,000 test accounts." }, { status: 400 });
    if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 100) return NextResponse.json({ error: "Enter a concurrency value from 1 to 100." }, { status: 400 });
    if (!suites.length || !suites.some((s: string) => s !== "provisioning")) return NextResponse.json({ error: "Select at least one test suite other than account setup." }, { status: 400 });
    if (suites.some(s => ["workflow","regression","localization","failure"].includes(s)) && accountCount !== 10000) return NextResponse.json({ error: "Workflow, regression, localization, and failure tests require 10,000 accounts." }, { status: 400 });
    const id = "campaign-" + randomUUID();
    await prisma.$executeRawUnsafe(
      "INSERT INTO qa_test_campaigns (id,name,target_environment,country_code,scenario,total_campaign_tests,tests_per_variation,account_count,concurrency,suites,variations,execution_mode,status,created_by) VALUES ($1,$2,'staging',$3,$4,$5,$5,$6,$7,$8::jsonb,$9::jsonb,'preview_only','draft',$10)",
      id, name, countryCode, scenario, totalTests, accountCount, concurrency, JSON.stringify(suites),
      JSON.stringify([{id:"standard-run",name:"Standard run",description:"",overrides:{}}]), actor
    );
    await prisma.adminAuditEvent.create({ data: { actor, action: "qa_campaign_draft_created", entityType: "qa_campaign", entityId: id, market: countryCode, details: { totalTests, accountCount, concurrency, suites } } });
    return NextResponse.json({ success: true, id, status: "draft" }, { status: 201 });
  }

  if (action === "qa-campaign-delete") {
    const id = typeof body?.campaignId === "string" ? body.campaignId : "";
    if (!/^campaign-[0-9a-f-]{36}$/i.test(id)) return NextResponse.json({ error: "Campaign ID is not valid." }, { status: 400 });
    const result = await prisma.$transaction(async tx => {
      const rows = await tx.$queryRawUnsafe<Array<{id:string;status:string;country_code:string}>>("SELECT id,status,country_code FROM qa_test_campaigns WHERE id=$1 FOR UPDATE", id);
      const campaign = rows[0];
      if (!campaign) return { error: "Campaign not found.", status: 404 };
      if (campaign.status !== "draft") return { error: "Only a draft that has not started can be deleted.", status: 409 };
      const steps = await tx.$queryRawUnsafe<Array<{id:string}>>("SELECT id FROM qa_test_campaign_steps WHERE campaign_id=$1 LIMIT 1", id);
      const runs = await tx.$queryRawUnsafe<Array<{id:string}>>("SELECT id FROM qa_test_runs WHERE summary->>'campaignId'=$1 LIMIT 1", id);
      if (steps.length || runs.length) return { error: "This draft has QA history. It cannot be deleted.", status: 409 };
      await tx.$executeRawUnsafe("DELETE FROM qa_test_campaigns WHERE id=$1 AND status='draft'", id);
      return { deleted: true, id, countryCode: campaign.country_code };
    });
    if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });
    await prisma.adminAuditEvent.create({ data: { actor, action: "qa_campaign_draft_deleted", entityType: "qa_campaign", entityId: id, market: result.countryCode, details: { historyDeleted: false } } });
    return NextResponse.json({ success: true, id });
  }

  if (action === "qa-campaign-start") {
    if (body?.confirm !== "RUN_QA_CAMPAIGN_ON_STAGING") return NextResponse.json({ error: "Confirm that this campaign should run on staging." }, { status: 400 });
    const campaignId = typeof body?.campaignId === "string" ? body.campaignId : "";
    if (!/^campaign-[0-9a-f-]{36}$/i.test(campaignId)) return NextResponse.json({ error: "Campaign ID is not valid." }, { status: 400 });
    if (!isQaRunnerEnabled()) return NextResponse.json({ error: "Test execution is not enabled for the approved staging environment." }, { status: 503 });
    const base = (process.env.QA_BASE_URL || "").replace(/\/+$/, "");
    if (!base.startsWith("https://") || process.env.QA_ACCOUNT_COUNT !== "10000" || process.env.POST2DRIVE_QA_DATABASE_ISOLATED !== "true") return NextResponse.json({ error: "Staging checks are not ready. No test was queued." }, { status: 503 });
    const result = await prisma.$transaction(async tx => {
      await tx.$queryRawUnsafe("WITH queue_lock AS MATERIALIZED (SELECT pg_advisory_xact_lock(hashtext($1))) SELECT 1 FROM queue_lock", "post2drive-qa-run-queue");
      const rows = await tx.$queryRawUnsafe<any[]>("SELECT id,name,country_code,scenario,total_campaign_tests,tests_per_variation,account_count,concurrency,suites,status FROM qa_test_campaigns WHERE id=$1 FOR UPDATE", campaignId);
      const campaign = rows[0];
      if (!campaign) return { error: "Campaign not found.", status: 404 };
      if (campaign.status !== "draft") return { error: "Only a draft that has not started can run.", status: 409 };
      const market = getMarket(String(campaign.country_code || ""));
      if (!market) return { error: "The campaign market is not supported.", status: 400 };
      const accountCount = Number(campaign.account_count), concurrency = Number(campaign.concurrency);
      const iterations = Number(campaign.tests_per_variation), totalTests = Number(campaign.total_campaign_tests);
      const suiteTypes: Record<string,string> = { provisioning:"synthetic-accounts", api:"api-load", workflow:"workflow-e2e", regression:"workflow-e2e", localization:"workflow-e2e", failure:"workflow-e2e" };
      const suites: string[] = (Array.isArray(campaign.suites) ? campaign.suites as unknown[] : []).filter((s: unknown): s is string => typeof s === "string" && Object.prototype.hasOwnProperty.call(suiteTypes, s));
      if (accountCount < 500 || accountCount > 10000 || !Number.isInteger(accountCount)) return { error: "Use 500 to 10,000 test accounts.", status: 400 };
      if (["workflow","regression","localization","failure"].some((s: string) => suites.includes(s)) && accountCount !== 10000) return { error: "This test suite requires 10,000 accounts.", status: 400 };
      if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 100 || !Number.isInteger(iterations) || iterations < 1 || iterations > 25000 || !Number.isInteger(totalTests) || totalTests < 1 || totalTests > 25000) return { error: "The test plan has invalid limits. Review the values and save a new draft.", status: 400 };
      if (!suites.length || !suites.some(s => s !== "provisioning")) return { error: "Select at least one test suite other than account setup.", status: 400 };
      const active = await tx.$queryRawUnsafe<Array<{id:string}>>("SELECT id FROM qa_test_runs WHERE status IN ('queued','running') ORDER BY started_at DESC LIMIT 1");
      if (active[0]) return { error: "Another QA run is queued or running. Wait until it finishes.", status: 409 };
      if (!suites.includes("provisioning")) {
        const pools = await tx.$queryRawUnsafe<Array<{id:string}>>("SELECT id FROM qa_test_runs WHERE status='completed' AND summary->>'testType'='synthetic-accounts' AND summary->>'country'=$1 AND target_accounts >= $2 ORDER BY finished_at DESC LIMIT 1", market.country, accountCount);
        if (!pools[0]) return { error: "A completed test-account pool is required for this market, or select account setup.", status: 409 };
      }
      const steps: Array<{id:string;ordinal:number;suite:string;testType:string;iterations:number}> = [];
      let ordinal = 0;
      if (suites.includes("provisioning")) steps.push({ id:"step-"+randomUUID(), ordinal:ordinal++, suite:"provisioning", testType:"synthetic-accounts", iterations:accountCount });
      for (const suite of suites.filter((s: string) => s !== "provisioning")) steps.push({ id:"step-"+randomUUID(), ordinal:ordinal++, suite, testType:suiteTypes[suite], iterations });
      if (steps.length > 101) return { error: "The campaign has too many steps.", status: 400 };
      const first = steps[0];
      if (!first) return { error: "The campaign has no runnable steps.", status: 400 };
      const runId = new Date().toISOString().replace(/[^0-9]/g, "").slice(0, 14) + "-" + randomUUID();
      await tx.$executeRawUnsafe("UPDATE qa_test_campaigns SET status='running',execution_mode='staging_sequential',updated_at=now() WHERE id=$1 AND status='draft'", campaignId);
      for (const step of steps) await tx.$executeRawUnsafe(
        "INSERT INTO qa_test_campaign_steps(id,campaign_id,ordinal,variation_id,variation_name,suite,test_type,test_iterations,account_count,concurrency,status) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)",
        step.id,campaignId,step.ordinal,"standard-run","Standard run",step.suite,step.testType,step.iterations,accountCount,concurrency,step.id===first.id?"queued":"pending"
      );
      const summary = { status:"queued",phase:"queued",country:market.country,testType:first.testType,testIterations:first.iterations,accountCount,concurrency,campaignId,campaignStepId:first.id,variationId:"standard-run",variationName:"Standard run",suite:first.suite,targetEnvironment:"staging",queuedAt:new Date().toISOString() };
      await tx.$executeRawUnsafe("INSERT INTO qa_test_runs(id,target_url,target_accounts,status,summary) VALUES($1,$2,$3,'queued',$4::jsonb)",runId,base,accountCount,JSON.stringify(summary));
      await tx.$executeRawUnsafe("UPDATE qa_test_campaign_steps SET run_id=$2 WHERE id=$1",first.id,runId);
      return { accepted:true,campaignId,runId,status:"queued",plannedSteps:steps.length,target:"staging",countryCode:market.country };
    }, { maxWait:15000, timeout:30000 });
    if ("error" in result) return NextResponse.json({ error: result.error }, { status: typeof result.status === "number" ? result.status : 400 });
    await prisma.adminAuditEvent.create({ data: { actor, action: "qa_campaign_queued", entityType: "qa_campaign", entityId: campaignId, market: result.countryCode, details: { runId: result.runId, plannedSteps: result.plannedSteps, target: "staging" } } });
    return NextResponse.json(result, { status: 202 });
  }

  return NextResponse.json({ error: "Unsupported admin action." }, { status: 400 });
}

export const POST = withApiMetrics("/api/internal/admin-bridge", handler);
