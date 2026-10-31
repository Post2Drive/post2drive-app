import { withApiMetrics } from "@/lib/apiMetrics";
import { requireJobMarketAccess } from "@/lib/jobMarket";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { reopenJobOpportunities } from "@/lib/opportunities";
import { isCancellationRestricted } from "@/lib/cancellationLimits";

// POST /api/jobs/[id]/driver-cancel — accepted driver backs out.
// Job returns to open so another driver can take it.
async function POSTHandler(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const routeParams = await params;
  const session = await getServerSession(authOptions);

  if (!session) {
    return NextResponse.json(
      { error: "Not logged in." },
      { status: 401 }
    );
  }

  const accountId =
    (session.user as any).accountId;
  if (!accountId) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }
  const marketAccessError = await requireJobMarketAccess(accountId, routeParams.id);
  if (marketAccessError) return marketAccessError;

  const job =
    await prisma.job.findUnique({
      where: { id: routeParams.id },
    });

  if (!job) {
    return NextResponse.json(
      { error: "Job not found." },
      { status: 404 }
    );
  }

  if (job.acceptedById !== accountId) {
    return NextResponse.json(
      {
        error:
          "Only the accepted driver can back out of this job.",
      },
      { status: 403 }
    );
  }

  if (job.status !== "accepted") {
    return NextResponse.json(
      {
        error:
          "This job isn't in a state that can be backed out of.",
      },
      { status: 409 }
    );
  }

  const restricted =
    await isCancellationRestricted(
      accountId
    );

  if (restricted) {
    return NextResponse.json(
      {
        error:
          "Your account has backed out of jobs too often recently and is temporarily restricted from this action.",
      },
      { status: 429 }
    );
  }

  const cancelledAt = new Date();
  const updated = await prisma.$transaction(async (tx) => {
    const transition = await tx.job.updateMany({
      where: { id: routeParams.id, status: "accepted", acceptedById: accountId },
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
        action: "DRIVER_BACKED_OUT",
        fromStatus: "accepted",
        toStatus: "open",
        description: "The accepted driver backed out before pickup and the job was reopened.",
        metadata: { reason: "driver_withdrawal_before_pickup", recordedAt: cancelledAt.toISOString() },
      },
    });

    await tx.notification.create({
      data: {
        accountId: job.posterId,
        type: "driver_withdrew",
        title: "The assigned driver backed out",
        body: `The driver withdrew from job ${routeParams.id} before pickup. The job is open for another driver.`,
        jobId: routeParams.id,
        eventKey: `driver-backed-out:${routeParams.id}:${cancelledAt.toISOString()}`,
      },
    });

    return tx.job.findUniqueOrThrow({ where: { id: routeParams.id } });
  });

  if (!updated) {
    return NextResponse.json({ error: "The job changed before the withdrawal could be completed. Refresh and try again." }, { status: 409 });
  }

  try {
    await reopenJobOpportunities(routeParams.id);
  } catch (error) {
    console.error("Failed to reopen driver opportunities after withdrawal.", { errorName: error instanceof Error ? error.name : "UnknownError" });
  }

  return NextResponse.json({
    success: true,
    job: updated,
  });
}
export const POST = withApiMetrics("/api/jobs/[id]/driver-cancel", POSTHandler);
