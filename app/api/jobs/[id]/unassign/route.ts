import { withApiMetrics } from "@/lib/apiMetrics";
import { requireJobMarketAccess } from "@/lib/jobMarket";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { reopenJobOpportunities } from "@/lib/opportunities";
import { isCancellationRestricted } from "@/lib/cancellationLimits";

// POST /api/jobs/[id]/unassign — poster removes the current driver but keeps
// the job open for another driver, instead of cancelling it outright.
// Counts toward the same cancellation-frequency limit as a full cancel.
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

  if (job.posterId !== accountId) {
    return NextResponse.json(
      { error: "Only the poster can do this." },
      { status: 403 }
    );
  }

  if (job.status !== "accepted") {
    return NextResponse.json(
      {
        error:
          "Only an accepted (not yet in transit) job can be reopened this way.",
      },
      { status: 409 }
    );
  }

  if (!job.acceptedById) {
    return NextResponse.json(
      { error: "This accepted job has no assigned driver. Refresh and contact support if the problem persists." },
      { status: 409 }
    );
  }

  const restricted = await isCancellationRestricted(accountId);

  if (restricted) {
    return NextResponse.json(
      {
        error:
          "Your account has cancelled too often recently and is temporarily restricted from this action.",
      },
      { status: 429 }
    );
  }

  const cancelledAt = new Date();
  const previousDriverId = job.acceptedById;
  const updated = await prisma.$transaction(async (tx) => {
    const transition = await tx.job.updateMany({
      where: { id: routeParams.id, status: "accepted", posterId: accountId, acceptedById: previousDriverId },
      data: {
        status: "open",
        acceptedById: null,
        cancelledById: accountId,
        cancelledAt,
      },
    });
    if (transition.count !== 1) return null;

    await tx.bid.updateMany({
      where: { jobId: routeParams.id, status: "active" },
      data: { status: "invalidated" },
    });

    await tx.jobActivity.create({
      data: {
        jobId: routeParams.id,
        actorId: accountId,
        action: "DRIVER_UNASSIGNED",
        fromStatus: "accepted",
        toStatus: "open",
        description: "The poster removed the assigned driver and reopened the job.",
        metadata: { reason: "poster_unassigned_driver", recordedAt: cancelledAt.toISOString() },
      },
    });

    if (previousDriverId && previousDriverId !== accountId) {
      await tx.notification.create({
        data: {
          accountId: previousDriverId,
          type: "driver_unassigned",
          title: "You were removed from an assigned job",
          body: `The poster reopened job ${routeParams.id} before pickup. The job is available for another driver.`,
          jobId: routeParams.id,
          eventKey: `job-unassigned:${routeParams.id}:${cancelledAt.toISOString()}`,
        },
      });
    }

    return tx.job.findUniqueOrThrow({ where: { id: routeParams.id } });
  });

  if (!updated) {
    return NextResponse.json({ error: "The job changed before it could be reopened. Refresh and try again." }, { status: 409 });
  }

  try {
    await reopenJobOpportunities(routeParams.id);
  } catch (error) {
    console.error("Failed to reopen driver opportunities after unassignment.", { errorName: error instanceof Error ? error.name : "UnknownError" });
  }

  return NextResponse.json({
    success: true,
    job: updated,
  });
}
export const POST = withApiMetrics("/api/jobs/[id]/unassign", POSTHandler);
