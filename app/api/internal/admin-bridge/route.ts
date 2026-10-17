import { createHash, createHmac, randomBytes, timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { withApiMetrics } from "@/lib/apiMetrics";
import { prisma } from "@/lib/prisma";
import { getPromotion, calculatePromotionalEnd } from "@/lib/promotion";
import { emailVerificationEnabled } from "@/lib/emailVerification";

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
  const declaredLength = Number(req.headers.get("content-length") || 0);
  if (declaredLength > 24_000) return NextResponse.json({ error: "Request too large." }, { status: 413 });
  const rawBody = await req.text();
  if (rawBody.length > 24_000) return NextResponse.json({ error: "Request too large." }, { status: 413 });
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
    const rawCode = "P2D-" + randomBytes(2).toString("hex").toUpperCase() + "-" + randomBytes(2).toString("hex").toUpperCase() + "-" + randomBytes(2).toString("hex").toUpperCase();
    const codeHash = createHash("sha256").update(rawCode).digest("hex");
    const created = await prisma.$transaction(async tx => {
      const code = await tx.testerAccessCode.create({ data: { codeHash } });
      await tx.adminAuditEvent.create({ data: { actor, action: "tester_access_code_generated", entityType: "tester_access_code", entityId: code.id, details: { codePrefix: "P2D", plaintextStored: false } } });
      return code;
    });
    return NextResponse.json({ success: true, code: rawCode, createdAt: created.createdAt.toISOString() }, { status: 201 });
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

  return NextResponse.json({ error: "Unsupported admin action." }, { status: 400 });
}

export const POST = withApiMetrics("/api/internal/admin-bridge", handler);
