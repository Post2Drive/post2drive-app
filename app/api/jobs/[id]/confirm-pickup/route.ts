import { withApiMetrics } from "@/lib/apiMetrics";
import { requireJobMarketAccess } from "@/lib/jobMarket";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// POST /api/jobs/[id]/confirm-pickup — either the poster or the accepted
// driver can confirm pickup. A conditional update makes the transition atomic.
async function POSTHandler(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const routeParams = await params;
  const session = await getServerSession(authOptions);

  if (!session) {
    return NextResponse.json({ error: "Not logged in." }, { status: 401 });
  }

  const accountId = (session.user as any).accountId;
  if (!accountId) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }
  const marketAccessError = await requireJobMarketAccess(accountId, routeParams.id);
  if (marketAccessError) return marketAccessError;

  const job = await prisma.job.findUnique({
    where: { id: routeParams.id },
  });

  if (!job) {
    return NextResponse.json({ error: "Job not found." }, { status: 404 });
  }

  if (job.posterId !== accountId && job.acceptedById !== accountId) {
    return NextResponse.json(
      { error: "You're not involved in this job." },
      { status: 403 }
    );
  }

  if (job.status !== "accepted") {
    return NextResponse.json(
      { error: "Only an accepted job can be confirmed as picked up." },
      { status: 409 }
    );
  }

  if (!job.acceptedById) {
    return NextResponse.json(
      { error: "This accepted job has no assigned driver. Refresh or contact support." },
      { status: 409 }
    );
  }

  // Commit the state transition and its audit event together. If activity
  // history cannot be written, the status change must roll back as well.
  const updated = await prisma.$transaction(async (tx) => {
    const transition = await tx.job.updateMany({
      where: { id: routeParams.id, status: "accepted", acceptedById: job.acceptedById },
      data: {
        status: "in_transit",
        pickupConfirmedById: accountId,
      },
    });

    if (transition.count !== 1) return null;

    const changedJob = await tx.job.findUniqueOrThrow({
      where: { id: routeParams.id },
    });

    await tx.jobActivity.create({
      data: {
        jobId: routeParams.id,
        actorId: accountId,
        action: "PICKUP_CONFIRMED",
        fromStatus: "accepted",
        toStatus: "in_transit",
        description: "Pickup was confirmed and the job is now in transit.",
      },
    });

    const recipientId = job.posterId === accountId ? job.acceptedById : job.posterId;
    if (recipientId && recipientId !== accountId) {
      await tx.notification.create({
        data: {
          accountId: recipientId,
          type: "pickup_confirmed",
          title: "Pickup confirmed",
          body: `Pickup was confirmed for job ${routeParams.id}; the job is now in transit.`,
          jobId: routeParams.id,
          eventKey: `pickup-confirmed:${routeParams.id}:${accountId}`,
        },
      });
    }

    return changedJob;
  });

  if (!updated) {
    return NextResponse.json(
      { error: "This job's status has already changed. Refresh and try again." },
      { status: 409 }
    );
  }

  return NextResponse.json({ success: true, job: updated });
}

export const POST = withApiMetrics("/api/jobs/[id]/confirm-pickup", POSTHandler);
