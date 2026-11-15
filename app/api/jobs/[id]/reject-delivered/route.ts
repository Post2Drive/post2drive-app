import { notify } from "@/lib/notify";
import { withApiMetrics } from "@/lib/apiMetrics";
import { enforceRateLimit } from "@/lib/rateLimit";
import { requireJobMarketAccess } from "@/lib/jobMarket";
import { canTransition } from "@/lib/jobTransitions";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

async function POSTHandler(
  req: Request,
  {
    params,
  }: {
    params: Promise<{
      id: string;
    }>;
  }
) {
  const routeParams = await params;
  const session =
    await getServerSession(
      authOptions
    );

  if (!session) {
    return NextResponse.json(
      {
        error:
          "Not logged in.",
      },
      { status: 401 }
    );
  }

  const accountId =
    (session.user as any)
      .accountId;
  if (!accountId) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }
  const marketAccessError = await requireJobMarketAccess(accountId, routeParams.id);
  if (marketAccessError) return marketAccessError;
  const writeLimit = await enforceRateLimit(req, { scope: "job-reject-delivered", identity: accountId, limit: 60, windowMs: 60 * 60 * 1000 });
  if (writeLimit) return writeLimit;

  const job =
    await prisma.job.findUnique({
      where: {
        id: routeParams.id,
      },
    });

  if (!job) {
    return NextResponse.json(
      {
        error:
          "Job not found.",
      },
      { status: 404 }
    );
  }

  if (
    job.posterId !==
      accountId &&
    job.acceptedById !==
      accountId
  ) {
    return NextResponse.json(
      {
        error:
          "You're not involved in this job.",
      },
      { status: 403 }
    );
  }

  if (
    job.status !==
    "delivered"
  ) {
    return NextResponse.json(
      {
        error:
          "This job is not awaiting delivery confirmation.",
      },
      { status: 409 }
    );
  }

  if (
    job.deliveryMarkedById ===
    accountId
  ) {
    return NextResponse.json(
      {
        error:
          "You're the one who marked it delivered. The other party must respond.",
      },
      { status: 403 }
    );
  }

  if (!job.deliveryMarkedById) {
    return NextResponse.json(
      { error: "This delivery has no recorded confirming party. Contact support." },
      { status: 409 }
    );
  }

  // A second rejection means the two sides cannot settle it between themselves:
  // the job goes to an administrator instead of bouncing back to in transit.
  const priorRejections = await prisma.jobActivity.count({
    where: { jobId: routeParams.id, action: "DELIVERY_REJECTED" },
  });
  if (priorRejections >= 1 && canTransition("delivered", "disputed")) {
    const escalated = await escalateToDispute(job, accountId, priorRejections + 1);
    if (!escalated) {
      return NextResponse.json({ error: "This delivery state has already changed. Refresh and try again." }, { status: 409 });
    }
    return NextResponse.json({ success: true, disputed: true, job: escalated });
  }

  const updated = await prisma.$transaction(async (tx) => {
    const transition = await tx.job.updateMany({
      where: {
        id: routeParams.id,
        status: "delivered",
        deliveryMarkedById: job.deliveryMarkedById,
      },
      data: {
        status: "in_transit",
        deliveryMarkedById: null,
      },
    });
    if (transition.count !== 1) return null;

    const changedJob = await tx.job.findUniqueOrThrow({ where: { id: routeParams.id } });
    await tx.jobActivity.create({
      data: {
        jobId: routeParams.id,
        actorId: accountId,
        action: "DELIVERY_REJECTED",
        fromStatus: "delivered",
        toStatus: "in_transit",
        description: "The other party rejected the delivery confirmation; the job returned to in transit.",
      },
    });

    const recipientId = job.deliveryMarkedById;
    if (recipientId && recipientId !== accountId) {
      const actorRole = job.posterId === accountId ? "poster" : "driver";
      await notify(tx, {
        accountId: recipientId,
        type: "delivery_rejected",
        title: `Delivery disputed by the ${actorRole}`,
        body: `The ${actorRole} disputed delivery for job ${routeParams.id}. The job is back in transit; review the incident history and contact support if needed.`,
        jobId: routeParams.id,
        eventKey: `delivery-rejected:${routeParams.id}:${accountId}:${Date.now()}`,
        metadata: { actorRole },
      });
    }
    return changedJob;
  });

  if (!updated) {
    return NextResponse.json({ error: "This delivery state has already changed. Refresh and try again." }, { status: 409 });
  }

  return NextResponse.json({
    success: true,
    job: updated,
  });
}

type RejectedJob = { id: string; posterId: string; acceptedById: string | null; deliveryMarkedById: string | null };

async function escalateToDispute(job: RejectedJob, rejecterId: string, rejectionCount: number) {
  const rejecterRole = job.posterId === rejecterId ? "poster" : "driver";
  return prisma.$transaction(async (tx) => {
    const transition = await tx.job.updateMany({
      where: { id: job.id, status: "delivered", deliveryMarkedById: job.deliveryMarkedById },
      data: { status: "disputed" },
    });
    if (transition.count !== 1) return null;

    const changedJob = await tx.job.findUniqueOrThrow({ where: { id: job.id } });
    const activity = await tx.jobActivity.create({
      data: {
        jobId: job.id,
        actorId: rejecterId,
        action: "DISPUTE_OPENED",
        fromStatus: "delivered",
        toStatus: "disputed",
        description: `The ${rejecterRole} rejected the delivery a second time, so the job is under review.`,
        metadata: {
          schemaVersion: 1,
          reason: "delivery_confirmation",
          notes: "Delivery was rejected twice, so this was sent for review automatically.",
          openedByRole: rejecterRole,
          previousStatus: "delivered",
          automatic: true,
          rejectionCount,
        },
      },
    });

    const recipientId = job.deliveryMarkedById;
    if (recipientId && recipientId !== rejecterId) {
      await notify(tx, {
        accountId: recipientId,
        type: "dispute_opened",
        title: `Delivery rejected again - now under review`,
        body: `The ${rejecterRole} rejected delivery for job ${job.id} a second time. The job is under review and cannot change until an administrator decides. You can see the details in the job history.`,
        jobId: job.id,
        eventKey: `dispute-opened:${activity.id}:${recipientId}`,
        metadata: { openedByRole: rejecterRole, reason: "delivery_confirmation", automatic: true },
      });
    }
    return changedJob;
  });
}

export const POST = withApiMetrics("/api/jobs/[id]/reject-delivered", POSTHandler);
