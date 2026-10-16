import { withApiMetrics } from "@/lib/apiMetrics";
import { requireJobMarketAccess } from "@/lib/jobMarket";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { expireJobOpportunities } from "@/lib/opportunities";
import { isCancellationRestricted } from "@/lib/cancellationLimits";

// POST /api/jobs/[id]/cancel — poster cancels their own job
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

  if (job.posterId !== accountId) {
    return NextResponse.json(
      {
        error:
          "Only the poster can cancel this job.",
      },
      { status: 403 }
    );
  }

  if (job.status === "cancelled") {
    return NextResponse.json(
      {
        error:
          "This job is already cancelled.",
      },
      { status: 409 }
    );
  }

  // A cancellation must never reverse pickup, delivery, or completion.
  // Restrict cancellation to pre-pickup states and re-check the observed
  // state in the transaction below to prevent stale requests winning races.
  if (job.status !== "open" && job.status !== "accepted") {
    return NextResponse.json(
      {
        code: "INCIDENT_REQUIRED",
        error:
          "Ordinary cancellation is only available before pickup. For a breakdown, health emergency, wrong or unsafe load, damage, or another issue, report an incident on this job so the original pickup/delivery history is preserved. Contact support urgently if anyone or the goods are at risk.",
        incidentEndpoint: `/api/jobs/${routeParams.id}/incidents`,
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
          "Your account has cancelled too often recently and is temporarily restricted from this action. If this is an emergency or the restriction is mistaken, contact support for review.",
      },
      { status: 429 }
    );
  }

  const previousStatus = job.status;

  // Cancellation, bid invalidation and the audit event are one transaction.
  // A stale request must not overwrite a status changed by another request.
  const updated = await prisma.$transaction(async (tx) => {
    const transition = await tx.job.updateMany({
      where: { id: routeParams.id, status: previousStatus },
      data: {
        status: "cancelled",
        cancelledById: accountId,
        cancelledAt: new Date(),
      },
    });

    if (transition.count !== 1) return null;

    await tx.bid.updateMany({
      where: { jobId: routeParams.id },
      data: { status: "invalidated" },
    });

    await tx.jobActivity.create({
      data: {
        jobId: routeParams.id,
        actorId: accountId,
        action: "JOB_CANCELLED",
        fromStatus: previousStatus,
        toStatus: "cancelled",
        description: "The poster cancelled the job.",
      },
    });

    if (job.acceptedById && job.acceptedById !== accountId) {
      await tx.notification.create({
        data: {
          accountId: job.acceptedById,
          type: "job_cancelled",
          title: "An accepted job was cancelled",
          body: `The poster cancelled job ${routeParams.id} before pickup.`,
          jobId: routeParams.id,
          eventKey: `job-cancelled:${routeParams.id}:${job.cancelledAt?.toISOString() || "pre-pickup"}`,
          metadata: { cancelledByAccountId: accountId, previousStatus },
        },
      });
    }

    return tx.job.findUniqueOrThrow({ where: { id: routeParams.id } });
  });

  if (!updated) {
    return NextResponse.json(
      { error: "This job's status has already changed. Refresh and try again." },
      { status: 409 }
    );
  }

  // Opportunity cleanup is secondary to the committed cancellation. Do not
  // return a false 500 after the job and bids have already been cancelled.
  try {
    await expireJobOpportunities(routeParams.id);
  } catch (error) {
    console.error("Failed to expire opportunities after job cancellation:", error);
  }

  return NextResponse.json({
    success: true,
    job: updated,
  });
}
export const POST = withApiMetrics("/api/jobs/[id]/cancel", POSTHandler);
