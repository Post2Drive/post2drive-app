import { withApiMetrics } from "@/lib/apiMetrics";
import { requireJobMarketAccess } from "@/lib/jobMarket";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  qualifyReferralFromCompletedJob,
} from "@/lib/referrals";

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
          "This job hasn't been marked delivered yet.",
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
          "The other party needs to confirm this delivery.",
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

  // Complete the job and persist its audit event atomically. Concurrent
  // confirmations can only let one request win the delivered -> completed CAS.
  const completedJob = await prisma.$transaction(async (tx) => {
    const transition = await tx.job.updateMany({
      where: { id: routeParams.id, status: "delivered", deliveryMarkedById: job.deliveryMarkedById },
      data: { status: "completed" },
    });

    if (transition.count !== 1) return null;

    const completed = await tx.job.findUniqueOrThrow({
      where: { id: routeParams.id },
    });

    await tx.jobActivity.create({
      data: {
        jobId: routeParams.id,
        actorId: accountId,
        action: "DELIVERY_CONFIRMED",
        fromStatus: "delivered",
        toStatus: "completed",
        description: "The other party confirmed the delivery and the job was completed.",
      },
    });

    const recipientId = job.deliveryMarkedById;
    if (recipientId && recipientId !== accountId) {
      await tx.notification.create({
        data: {
          accountId: recipientId,
          type: "job_completed",
          title: "Delivery confirmed — job completed",
          body: `The other party confirmed delivery for job ${routeParams.id}; the job is now completed.`,
          jobId: routeParams.id,
          eventKey: `job-completed:${routeParams.id}`,
        },
      });
    }

    return completed;
  });

  if (!completedJob) {
    return NextResponse.json(
      { error: "This delivery has already been completed." },
      { status: 409 }
    );
  }

  /*
   * The referred account is determined from the
   * actual job parties, not from the confirming user.
   *
   * This prevents a referrer from accidentally receiving
   * credit for the wrong account.
   */
  const referredCandidates =
    [
      job.posterId,
      job.acceptedById,
    ].filter(
      (
        id
      ): id is string =>
        Boolean(id)
    );

  for (
    const candidateId of
      referredCandidates
  ) {
    try {
      const result =
        await qualifyReferralFromCompletedJob(
          candidateId,
          job.id
        );

      if (result) {
        break;
      }
    } catch (error) {
      console.error(
        "Referral qualification error:",
        error
      );
    }
  }

  return NextResponse.json({
    success: true,
    job: completedJob,
  });
}
export const POST = withApiMetrics("/api/jobs/[id]/confirm-delivered", POSTHandler);
