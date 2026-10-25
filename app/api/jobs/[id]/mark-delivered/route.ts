import { withApiMetrics } from "@/lib/apiMetrics";
import { requireJobMarketAccess } from "@/lib/jobMarket";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// POST /api/jobs/[id]/mark-delivered — either involved party marks it delivered.
// This does NOT complete the job — the other party still has to confirm.
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

  // Delivery must follow pickup confirmation. Allowing "accepted" here
  // would let either party skip the pickup/in-transit stage entirely.
  if (job.status !== "in_transit") {
    return NextResponse.json(
      { error: "Confirm pickup first; only an in-transit job can be marked delivered." },
      { status: 409 }
    );
  }

  if (!job.acceptedById) {
    return NextResponse.json(
      { error: "This in-transit job has no assigned driver. Contact support before changing its status." },
      { status: 409 }
    );
  }

  // Commit the state transition and its audit event together so they cannot
  // diverge if the activity insert fails.
  const updated = await prisma.$transaction(async (tx) => {
    const transition = await tx.job.updateMany({
      where: { id: routeParams.id, status: "in_transit", acceptedById: job.acceptedById },
      data: {
        status: "delivered",
        deliveryMarkedById: accountId,
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
        action: "DELIVERY_MARKED",
        fromStatus: job.status,
        toStatus: "delivered",
        description: "The job was marked as delivered and is awaiting confirmation.",
      },
    });

    const recipientId = job.posterId === accountId ? job.acceptedById : job.posterId;
    if (recipientId && recipientId !== accountId) {
      const eventKey = `delivery-marked:${routeParams.id}:${accountId}`;
      await tx.notification.upsert({
        where: { eventKey },
        update: {},
        create: {
          accountId: recipientId,
          type: "delivery_marked",
          title: "Delivery awaiting confirmation",
          body: `Job ${routeParams.id} was marked delivered. Please review and confirm or report a delivery issue.`,
          jobId: routeParams.id,
          eventKey,
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

export const POST = withApiMetrics("/api/jobs/[id]/mark-delivered", POSTHandler);
