import { withApiMetrics } from "@/lib/apiMetrics";
import { requireJobMarketAccess } from "@/lib/jobMarket";
import { getJobPickupAtForAccount, pickupAccessError } from "@/lib/jobAccess";
import { getAccountAccess } from "@/lib/access";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { expireJobOpportunities } from "@/lib/opportunities";
import { canPostJobs, vehicleEligibilityWhere } from "@/lib/eligibility";

// POST /api/jobs/[id]/bids/[bidId]/accept
// Poster accepts one bid and assigns the job to that driver.
async function POSTHandler(
  req: Request,
  { params }: { params: Promise<{ id: string; bidId: string }> }
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

  const marketplaceAccessCheck = await getAccountAccess(accountId);

  const job = await prisma.job.findUnique({
    where: { id: routeParams.id },
  });

  if (!job) {
    return NextResponse.json({ error: "Job not found." }, { status: 404 });
  }
  if (job.currency === "INR" || job.priceMode !== "bid") {
    return NextResponse.json({ error: "This job does not support bidding." }, { status: 400 });
  }

  let pickupAt: Date;

  try {
    pickupAt = await getJobPickupAtForAccount(
      accountId,
      job.jobDate,
      job.pickupTime,
      job.pickupTimeZone
    );
  } catch {
    return NextResponse.json(
      { error: "This job has an invalid pickup time." },
      { status: 409 }
    );
  }

  const pickupError =
    pickupAccessError(
      marketplaceAccessCheck,
      pickupAt
    );

  if (pickupError) {
    return NextResponse.json(
      pickupError,
      { status: pickupError.status }
    );
  }

  if (job.posterId !== accountId) {
    return NextResponse.json(
      { error: "Only the poster can accept a bid." },
      { status: 403 }
    );
  }

  const posterVerification = await prisma.account.findUnique({
    where: { id: accountId },
    select: { verificationStatus: true, companyVerificationStatus: true },
  });
  if (!posterVerification || !canPostJobs(posterVerification)) {
    return NextResponse.json({ error: "Complete account verification and obtain business approval before awarding a job." }, { status: 403 });
  }

  if (job.status !== "open") {
    return NextResponse.json(
      { error: "This job is no longer open." },
      { status: 409 }
    );
  }

  const bid = await prisma.bid.findUnique({
    where: { id: routeParams.bidId },
  });

  if (!bid || bid.jobId !== routeParams.id) {
    return NextResponse.json(
      { error: "Bid not found." },
      { status: 404 }
    );
  }

  const bidderAccess = await getAccountAccess(bid.bidderId);
  if (!bidderAccess.allowed) {
    return NextResponse.json(
      { error: "The bidder no longer has active marketplace access." },
      { status: 409 }
    );
  }

  if (bid.bidderId === job.posterId) {
    return NextResponse.json(
      { error: "A poster cannot accept their own bid." },
      { status: 400 }
    );
  }

  const updated = await prisma.$transaction(async (tx) => {
    // Re-read the job in the transaction. A concurrent edit can change the
    // requested vehicle type while the job is still open.
    const currentJob = await tx.job.findUnique({
      where: { id: routeParams.id },
      select: { id: true, posterId: true, status: true, priceMode: true, vehicleType: true },
    });
    if (!currentJob || currentJob.status !== "open" || currentJob.posterId !== accountId || currentJob.priceMode !== "bid") {
      throw new Error("JOB_ALREADY_TAKEN");
    }

    // A bid is selectable only while its driver and matching vehicle remain approved.
    const currentBid = await tx.bid.findFirst({
      where: {
        id: bid.id,
        jobId: routeParams.id,
        status: "active",
        bidder: {
          verificationStatus: "verified",
          vehicles: {
            some: {
              vehicleType: currentJob.vehicleType,
              verificationStatus: "verified",
            },
          },
        },
      },
    });

    if (!currentBid) {
      throw new Error("BID_NO_LONGER_ELIGIBLE");
    }

    // Recheck the current vehicle's insurance and market-specific inspection immediately before award.
    const currentBidder = await tx.account.findUnique({
      where: { id: currentBid.bidderId },
      select: { country: true, currency: true, verificationStatus: true, companyVerificationStatus: true },
    });
    if (!currentBidder || currentBidder.verificationStatus !== "verified") {
      throw new Error("BID_NO_LONGER_ELIGIBLE");
    }
    const matchingVehicle = await tx.vehicle.findFirst({
      where: {
        accountId: currentBid.bidderId,
        ...vehicleEligibilityWhere(currentBidder, currentJob.vehicleType),
      },
      select: { id: true },
    });
    if (!matchingVehicle) throw new Error("BID_NO_LONGER_ELIGIBLE");

    // Atomically claim the job only if it is still open.
    const claimed = await tx.job.updateMany({
      where: {
        id: routeParams.id,
        posterId: accountId,
        status: "open",
        priceMode: "bid",
      },
      data: {
        status: "accepted",
        acceptedById: currentBid.bidderId,
        price: currentBid.amount,
      },
    });

    if (claimed.count !== 1) {
      throw new Error("JOB_ALREADY_TAKEN");
    }

    const otherBids = await tx.bid.findMany({
      where: {
        jobId: routeParams.id,
        id: { not: currentBid.id },
        status: "active",
      },
      select: { id: true, bidderId: true },
    });

    await tx.bid.updateMany({
      where: {
        jobId: routeParams.id,
        id: { not: currentBid.id },
        status: "active",
      },
      data: {
        status: "invalidated",
      },
    });

    await tx.jobActivity.create({
      data: {
        jobId: routeParams.id,
        actorId: accountId,
        action: "BID_ACCEPTED",
        fromStatus: "open",
        toStatus: "accepted",
        description: "The poster accepted a bid and assigned the job to the driver.",
        metadata: {
          bidId: currentBid.id,
          driverId: currentBid.bidderId,
          amount: currentBid.amount,
        },
      },
    });

    await tx.notification.create({
      data: {
        accountId: currentBid.bidderId,
        type: "bid_accepted",
        title: "Your bid was accepted",
        body: `Your bid was accepted for job ${routeParams.id}. Review the job details and coordinate pickup.`,
        jobId: routeParams.id,
        eventKey: `bid-accepted:${routeParams.id}:${currentBid.id}`,
        metadata: { bidId: currentBid.id, amount: currentBid.amount },
      },
    });

    if (otherBids.length > 0) {
      await tx.notification.createMany({
        data: otherBids.map((otherBid) => ({
          accountId: otherBid.bidderId,
          type: "bid_not_selected",
          title: "Another bid was selected",
          body: `The poster selected another bid for job ${routeParams.id}. This job is no longer open.`,
          jobId: routeParams.id,
          eventKey: `bid-not-selected:${routeParams.id}:${otherBid.id}`,
        })),
        skipDuplicates: true,
      });
    }

    return tx.job.findUniqueOrThrow({
      where: { id: routeParams.id },
    });
  }).catch((error) => {
    if (
      error instanceof Error &&
      error.message === "JOB_ALREADY_TAKEN"
    ) {
      return null;
    }
    if (
      error instanceof Error &&
      error.message === "BID_NO_LONGER_ELIGIBLE"
    ) {
      return "BID_NO_LONGER_ELIGIBLE" as const;
    }
    throw error;
  });

  if (updated === "BID_NO_LONGER_ELIGIBLE") {
    return NextResponse.json(
      { error: "This bid is no longer active, or the bidder no longer has a verified matching vehicle with current insurance and any required inspection." },
      { status: 409 }
    );
  }

  if (!updated) {
    return NextResponse.json(
      { error: "This job is no longer open to bidding. Refresh and review its current status." },
      { status: 409 }
    );
  }

  await expireJobOpportunities(routeParams.id, updated.acceptedById);

  return NextResponse.json({ success: true, job: updated });
}
export const POST = withApiMetrics("/api/jobs/[id]/bids/[bidId]/accept", POSTHandler);
