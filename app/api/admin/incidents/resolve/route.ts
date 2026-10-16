import { withApiMetrics } from "@/lib/apiMetrics";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isTesterAdmin } from "@/lib/testerAdmin";

const ALLOWED_OUTCOMES = new Set([
  "resume",
  "reassign",
  "return_goods",
  "terminate_with_incident",
  "delivery_dispute",
  "payment_dispute",
  "no_further_action",
]);

const ALLOWED_TERMINATION_REASONS = new Set([
  "vehicle_breakdown",
  "health_emergency",
  "wrong_load",
  "unsafe_load",
  "accident",
  "delay",
  "pickup_problem",
  "delivery_damage",
  "other",
]);

async function GETHandler() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Not logged in." }, { status: 401 });
  if (!(await isTesterAdmin())) return NextResponse.json({ error: "Administrator access required." }, { status: 403 });

  const [incidents, resolutions] = await Promise.all([
    prisma.jobActivity.findMany({
      where: { action: "INCIDENT_REPORTED" },
      orderBy: { createdAt: "desc" },
      take: 100,
      include: {
        job: { select: { id: true, status: true, pickup: true, dropoff: true, posterId: true, acceptedById: true } },
        actor: { select: { displayId: true, companyName: true } },
      },
    }),
    prisma.jobActivity.findMany({
      where: { action: "INCIDENT_RESOLUTION_RECORDED" },
      orderBy: { createdAt: "desc" },
      take: 500,
      select: { id: true, jobId: true, description: true, metadata: true, createdAt: true },
    }),
  ]);
  const evidenceFiles = incidents.length
    ? await prisma.incidentEvidence.findMany({
        where: { incidentId: { in: incidents.map((incident) => incident.id) } },
        orderBy: { createdAt: "asc" },
        select: { id: true, incidentId: true, fileName: true, mimeType: true, sizeBytes: true, sha256: true, createdAt: true },
      })
    : [];

  const incidentsWithHistory = incidents.map((incident) => ({
    ...incident,
    resolutions: resolutions.filter((resolution) =>
      resolution.jobId === incident.jobId &&
      (resolution.metadata as any)?.parentIncidentId === incident.id
    ),
    evidenceFiles: evidenceFiles.filter((file) => file.incidentId === incident.id),
  }));
  return NextResponse.json({ incidents: incidentsWithHistory });
}

async function POSTHandler(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Not logged in." }, { status: 401 });
  if (!(await isTesterAdmin())) return NextResponse.json({ error: "Administrator access required." }, { status: 403 });

  const accountId = (session.user as any)?.accountId;
  if (!accountId) return NextResponse.json({ error: "Administrator account is not linked to an account record." }, { status: 403 });

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const jobId = typeof body?.jobId === "string" ? body.jobId : "";
  const incidentId = typeof body?.incidentId === "string" ? body.incidentId : "";
  const outcome = typeof body?.outcome === "string" ? body.outcome : "";
  const notes = typeof body?.notes === "string" ? body.notes.trim() : "";

  if (!jobId || !incidentId) return NextResponse.json({ error: "jobId and incidentId are required." }, { status: 400 });
  if (!ALLOWED_OUTCOMES.has(outcome)) return NextResponse.json({ error: "Choose a supported incident outcome." }, { status: 400 });
  if (!notes || notes.length > 4000) return NextResponse.json({ error: "Resolution notes are required and must be at most 4000 characters." }, { status: 400 });

  const incident = await prisma.jobActivity.findFirst({
    where: { id: incidentId, jobId, action: "INCIDENT_REPORTED" },
    select: { id: true, createdAt: true, metadata: true },
  });
  if (!incident) return NextResponse.json({ error: "Incident report not found for this job." }, { status: 404 });

  const job = await prisma.job.findUnique({
    where: { id: jobId },
    select: {
      id: true,
      status: true,
      posterId: true,
      acceptedById: true,
      pickupConfirmedById: true,
      deliveryMarkedById: true,
    },
  });
  if (!job) return NextResponse.json({ error: "Job not found." }, { status: 404 });

  // This is the one support outcome that changes lifecycle state. It is
  // deliberately restricted to accepted/in-transit jobs so delivery history
  // can never be erased by an administrative incident decision.
  if (outcome === "terminate_with_incident") {
    const reportedReason = (incident.metadata as any)?.reason;
    if (typeof reportedReason !== "string" || !ALLOWED_TERMINATION_REASONS.has(reportedReason)) {
      return NextResponse.json({
        error: "This incident type is not eligible for termination. Preserve the job history and use the appropriate dispute or support workflow.",
      }, { status: 409 });
    }
  }

  if (outcome === "terminate_with_incident" && job.status !== "accepted" && job.status !== "in_transit") {
    return NextResponse.json({
      error: job.status === "delivered" || job.status === "completed"
        ? "Delivery has already been marked. Preserve that history and record a delivery/damage/payment dispute instead."
        : "Only an accepted or in-transit job can be terminated through an incident resolution.",
    }, { status: 409 });
  }

  const resolvedAt = new Date();
  const transactionResult = await prisma.$transaction(async (tx) => {
    let finalStatus = job.status;
    let lifecycleChanged = false;

    if (outcome === "terminate_with_incident") {
      const transition = await tx.job.updateMany({
        where: {
          id: jobId,
          status: job.status,
          posterId: job.posterId,
          acceptedById: job.acceptedById,
        },
        data: {
          status: "cancelled",
          cancelledById: accountId,
          cancelledAt: resolvedAt,
        },
      });
      if (transition.count !== 1) return null;

      await tx.bid.updateMany({
        where: { jobId, status: "active" },
        data: { status: "invalidated" },
      });

      finalStatus = "cancelled";
      lifecycleChanged = true;
      const reason = typeof (incident.metadata as any)?.reason === "string"
        ? (incident.metadata as any).reason
        : "other";

      await tx.jobActivity.create({
        data: {
          jobId,
          actorId: accountId,
          action: "JOB_TERMINATED_WITH_INCIDENT",
          fromStatus: job.status,
          toStatus: "cancelled",
          description: `Support terminated the job through incident resolution: ${reason.replaceAll("_", " ")}.`,
          metadata: {
            schemaVersion: 1,
            incidentId,
            reason,
            notes,
            terminatedByRole: "tester_admin",
            terminatedAt: resolvedAt.toISOString(),
            pickupHistoryPreserved: Boolean(job.pickupConfirmedById),
            deliveryHistoryPreserved: Boolean(job.deliveryMarkedById),
            cancellationLimitBypassedForSafetyIncident: true,
          },
        },
      });
    }

    const created = await tx.jobActivity.create({
      data: {
        jobId,
        actorId: accountId,
        action: "INCIDENT_RESOLUTION_RECORDED",
        fromStatus: job.status,
        toStatus: finalStatus,
        description: `Incident resolution recorded: ${outcome.replaceAll("_", " ")}.`,
        metadata: {
          schemaVersion: 2,
          parentIncidentId: incidentId,
          outcome,
          notes,
          resolvedAt: resolvedAt.toISOString(),
          lifecycleStatusAtResolution: finalStatus,
          lifecycleChanged,
          execution: outcome === "terminate_with_incident"
            ? "Job was conditionally terminated; active bids were invalidated."
            : "Decision recorded only. Any recovery, reassignment, return-of-goods or commercial arrangements remain manual and must be coordinated by support and the parties.",
        },
      },
    });

    const recipients = [...new Set([job.posterId, job.acceptedById].filter((value): value is string => Boolean(value) && value !== accountId))];
    for (const recipientId of recipients) {
      await tx.notification.create({
        data: {
          accountId: recipientId,
          type: "incident_resolution",
          title: outcome === "terminate_with_incident" ? "Support terminated the job due to an incident" : "Support recorded an incident decision",
          body: outcome === "terminate_with_incident"
            ? `Support terminated job ${jobId} through the incident workflow. Previous pickup/delivery milestones remain in the activity history. Review the incident details and contact support if needed.`
            : `Support recorded a decision for the incident on job ${jobId}. Open the incident history to review the decision and any next steps.`,
          jobId,
          eventKey: `incident-resolution:${created.id}:${recipientId}`,
          metadata: { incidentId, resolutionId: created.id, outcome, lifecycleChanged },
        },
      });
    }
    return { resolution: created, finalStatus, lifecycleChanged };
  });

  if (!transactionResult) {
    return NextResponse.json({ error: "The job status changed while this decision was being processed. Refresh the incident and review the current job state before retrying." }, { status: 409 });
  }

  return NextResponse.json({
    success: true,
    resolution: transactionResult.resolution,
    jobStatus: transactionResult.finalStatus,
    lifecycleChanged: transactionResult.lifecycleChanged,
  }, { status: 201 });
}

export const GET = withApiMetrics("/api/admin/incidents/resolve", GETHandler);
export const POST = withApiMetrics("/api/admin/incidents/resolve", POSTHandler);
