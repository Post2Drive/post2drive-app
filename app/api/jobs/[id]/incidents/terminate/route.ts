import { withApiMetrics } from "@/lib/apiMetrics";
import { requireJobMarketAccess } from "@/lib/jobMarket";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type RouteContext = { params: Promise<{ id: string }> };
const ALLOWED_REASONS = new Set([
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

async function POSTHandler(req: Request, { params }: RouteContext) {
  const { id: jobId } = await params;
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Not logged in." }, { status: 401 });
  const accountId = (session.user as any)?.accountId;
  if (!accountId) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }
  const marketAccessError = await requireJobMarketAccess(accountId, jobId);
  if (marketAccessError) return marketAccessError;

  const job = await prisma.job.findUnique({ where: { id: jobId } });
  if (!job) return NextResponse.json({ error: "Job not found." }, { status: 404 });
  if (job.posterId !== accountId && job.acceptedById !== accountId) {
    return NextResponse.json({ error: "Only the poster or accepted driver can terminate an active job through its incident workflow." }, { status: 403 });
  }

  if (job.status !== "accepted" && job.status !== "in_transit") {
    return NextResponse.json({
      error: job.status === "delivered" || job.status === "completed"
        ? "Delivery has already been marked. Keep the delivery record and open a delivery/damage/payment dispute instead of cancelling it."
        : "This job is not in a state that can be terminated through an incident.",
    }, { status: 409 });
  }

  let body: any;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }

  const incidentId = typeof body?.incidentId === "string" ? body.incidentId : "";
  const reason = typeof body?.reason === "string" ? body.reason : "";
  const notes = typeof body?.notes === "string" ? body.notes.trim() : "";
  const evidence = body?.evidence === undefined ? [] : body.evidence;

  if (!incidentId) return NextResponse.json({ error: "Report an incident before terminating the job." }, { status: 400 });
  if (!ALLOWED_REASONS.has(reason)) return NextResponse.json({ error: "Choose a supported incident termination reason." }, { status: 400 });
  if (!notes || notes.length > 4000) return NextResponse.json({ error: "Explain why the job cannot continue (maximum 4000 characters)." }, { status: 400 });
  if (!Array.isArray(evidence) || evidence.length > 10 || evidence.some((item) => typeof item !== "string" || item.length > 1000 || !/^https:\/\//i.test(item) || /[\r\n]/.test(item))) {
    return NextResponse.json({ error: "Evidence must be up to 10 HTTPS references, each no longer than 1000 characters. You may add further evidence to the incident later." }, { status: 400 });
  }

  const incident = await prisma.jobActivity.findFirst({
    where: { id: incidentId, jobId, action: "INCIDENT_REPORTED" },
    select: { id: true, metadata: true },
  });
  if (!incident) return NextResponse.json({ error: "Incident report not found for this job." }, { status: 404 });
  const reportedReason = (incident.metadata as any)?.reason;
  if (reportedReason !== reason) {
    return NextResponse.json({ error: "The termination reason must match the original incident report. Submit a separate incident if a different issue has arisen." }, { status: 400 });
  }

  const cancelledAt = new Date();
  const result = await prisma.$transaction(async (tx) => {
    const transition = await tx.job.updateMany({
      where: { id: jobId, status: job.status, posterId: job.posterId, acceptedById: job.acceptedById },
      data: {
        status: "cancelled",
        cancelledById: accountId,
        cancelledAt,
      },
    });
    if (transition.count !== 1) return null;

    await tx.bid.updateMany({
      where: { jobId, status: "active" },
      data: { status: "invalidated" },
    });

    const changedJob = await tx.job.findUniqueOrThrow({ where: { id: jobId } });
    await tx.jobActivity.create({
      data: {
        jobId,
        actorId: accountId,
        action: "JOB_TERMINATED_WITH_INCIDENT",
        fromStatus: job.status,
        toStatus: "cancelled",
        description: `Job terminated through incident workflow: ${reason.replaceAll("_", " ")}.`,
        metadata: {
          schemaVersion: 1,
          incidentId,
          reason,
          notes,
          evidence,
          terminatedByRole: job.posterId === accountId ? "poster" : "driver",
          terminatedAt: cancelledAt.toISOString(),
          pickupHistoryPreserved: Boolean(job.pickupConfirmedById),
          deliveryHistoryPreserved: Boolean(job.deliveryMarkedById),
          cancellationLimitBypassedForSafetyIncident: true,
        },
      },
    });

    const recipientId = job.posterId === accountId ? job.acceptedById : job.posterId;
    if (recipientId && recipientId !== accountId) {
      await tx.notification.create({
        data: {
          accountId: recipientId,
          type: "job_terminated_with_incident",
          title: "Job terminated due to an incident",
          body: `Job ${jobId} was terminated through its incident workflow. The original pickup/delivery history remains recorded. Review the incident details and contact support if needed.`,
          jobId,
          eventKey: `job-terminated-incident:${jobId}:${cancelledAt.toISOString()}`,
          metadata: { incidentId, reason, terminatedByAccountId: accountId },
        },
      });
    }

    return changedJob;
  });

  if (!result) {
    return NextResponse.json({ error: "The job status changed while this incident was being processed. Refresh the job and try again." }, { status: 409 });
  }

  return NextResponse.json({ success: true, job: result, incidentId, terminatedWithIncident: true });
}

export const POST = withApiMetrics("/api/jobs/[id]/incidents/terminate", POSTHandler);
