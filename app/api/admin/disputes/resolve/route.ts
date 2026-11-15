import { withApiMetrics } from "@/lib/apiMetrics";
import { NextResponse } from "next/server";
import { readBoundedJson } from "@/lib/requestBody";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isTesterAdmin } from "@/lib/testerAdmin";
import { canTransition } from "@/lib/jobTransitions";
import { DISPUTE_OUTCOMES, isDisputeOutcome } from "@/lib/disputes";
import { notify } from "@/lib/notify";

async function GETHandler() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Not logged in." }, { status: 401 });
  if (!(await isTesterAdmin())) return NextResponse.json({ error: "Administrator access required." }, { status: 403 });

  const jobs = await prisma.job.findMany({
    where: { status: "disputed" },
    orderBy: { createdAt: "asc" },
    take: 100,
    select: {
      id: true,
      pickup: true,
      dropoff: true,
      posterId: true,
      acceptedById: true,
      deliveryMarkedById: true,
      createdAt: true,
      activities: {
        where: { action: "DISPUTE_OPENED" },
        orderBy: { createdAt: "desc" },
        take: 1,
        select: { id: true, actorId: true, createdAt: true, metadata: true },
      },
    },
  });
  return NextResponse.json({ disputes: jobs });
}

async function POSTHandler(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Not logged in." }, { status: 401 });
  if (!(await isTesterAdmin())) return NextResponse.json({ error: "Administrator access required." }, { status: 403 });

  const accountId = (session.user as any)?.accountId;
  if (!accountId) return NextResponse.json({ error: "Administrator account is not linked to an account record." }, { status: 403 });

  const parsedBody = await readBoundedJson(req, 16 * 1024);
  if (!parsedBody.ok) {
    return NextResponse.json(
      { error: parsedBody.status === 413 ? "Request body is too large." : "Request body must be valid JSON." },
      { status: parsedBody.status },
    );
  }
  if (!parsedBody.value || typeof parsedBody.value !== "object" || Array.isArray(parsedBody.value)) {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }
  const body = parsedBody.value as Record<string, unknown>;
  const jobId = typeof body.jobId === "string" ? body.jobId : "";
  const outcome = body.outcome;
  const notes = typeof body.notes === "string" ? body.notes.trim() : "";

  if (!jobId) return NextResponse.json({ error: "jobId is required." }, { status: 400 });
  if (!isDisputeOutcome(outcome)) return NextResponse.json({ error: "Choose a supported dispute outcome." }, { status: 400 });
  if (!notes || notes.length > 4000) return NextResponse.json({ error: "A written reason is required (maximum 4000 characters)." }, { status: 400 });

  const decision = DISPUTE_OUTCOMES[outcome];
  const target = decision.to;

  const job = await prisma.job.findUnique({
    where: { id: jobId },
    select: { id: true, status: true, posterId: true, acceptedById: true, deliveryMarkedById: true },
  });
  if (!job) return NextResponse.json({ error: "Job not found." }, { status: 404 });
  if (job.status !== "disputed") return NextResponse.json({ error: "This job is not under dispute." }, { status: 409 });
  if (!canTransition("disputed", target)) {
    return NextResponse.json({ error: "That outcome is not allowed for a disputed job." }, { status: 409 });
  }
  if (target === "completed" && !job.deliveryMarkedById) {
    return NextResponse.json({ error: "Delivery was never marked, so the job cannot be completed. Return it to transit or cancel it." }, { status: 409 });
  }

  const resolvedAt = new Date();
  const result = await prisma.$transaction(async (tx) => {
    const transition = await tx.job.updateMany({
      where: { id: jobId, status: "disputed", posterId: job.posterId, acceptedById: job.acceptedById },
      data: {
        status: target,
        ...(target === "in_transit" ? { deliveryMarkedById: null } : {}),
        ...(target === "cancelled" ? { cancelledById: accountId, cancelledAt: resolvedAt } : {}),
      },
    });
    if (transition.count !== 1) return null;

    if (target === "cancelled") {
      await tx.bid.updateMany({ where: { jobId, status: "active" }, data: { status: "invalidated" } });
    }

    const activity = await tx.jobActivity.create({
      data: {
        jobId,
        actorId: accountId,
        action: "DISPUTE_RESOLVED",
        fromStatus: "disputed",
        toStatus: target,
        description: `An administrator resolved the dispute: ${decision.label}.`,
        metadata: {
          schemaVersion: 1,
          outcome,
          fault: decision.fault,
          notes,
          resolvedAt: resolvedAt.toISOString(),
          resolvedByRole: "tester_admin",
          automaticPenalty: false,
        },
      },
    });

    const recipients = [...new Set([job.posterId, job.acceptedById].filter((value): value is string => Boolean(value) && value !== accountId))];
    for (const recipientId of recipients) {
      await notify(tx, {
        accountId: recipientId,
        type: "dispute_resolved",
        title: "The dispute on your job was decided",
        body: `An administrator decided the dispute for job ${jobId}: ${decision.label}. Open the job history to read the decision.`,
        jobId,
        eventKey: `dispute-resolved:${activity.id}:${recipientId}`,
        metadata: { outcome },
      });
    }
    return { activity, status: target };
  });

  if (!result) {
    return NextResponse.json({ error: "The job changed while this decision was being processed. Refresh and review it before retrying." }, { status: 409 });
  }

  return NextResponse.json({ success: true, jobStatus: result.status, resolution: result.activity }, { status: 201 });
}

export const GET = withApiMetrics("/api/admin/disputes/resolve", GETHandler);
export const POST = withApiMetrics("/api/admin/disputes/resolve", POSTHandler);
