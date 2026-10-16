import { withApiMetrics } from "@/lib/apiMetrics";
import { requireJobMarketAccess } from "@/lib/jobMarket";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { recordJobActivity } from "@/lib/jobActivity";

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
      await tx.notification.create({
        data: {
          accountId: recipientId,
          type: "delivery_rejected",
          title: "Delivery confirmation was disputed",
          body: `The other party disputed delivery for job ${routeParams.id}. The job is back in transit; review the incident history and contact support if needed.`,
          jobId: routeParams.id,
          eventKey: `delivery-rejected:${routeParams.id}:${accountId}:${Date.now()}`,
        },
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
export const POST = withApiMetrics("/api/jobs/[id]/reject-delivered", POSTHandler);
