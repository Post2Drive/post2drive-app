import { enforceRateLimit } from "@/lib/rateLimit";
import { withApiMetrics } from "@/lib/apiMetrics";
import { requireJobMarketAccess } from "@/lib/jobMarket";
import { getJobPickupAtForAccount, pickupAccessError } from "@/lib/jobAccess";
import { getAccountAccess } from "@/lib/access";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { markDriverOpportunityBid } from "@/lib/opportunities";
import { getLocalisationProfile } from "@/lib/localisation";
import { marketDateKey } from "@/lib/vehicleDates";

async function POSTHandler(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const routeParams = await params;
  const session =
    await getServerSession(
      authOptions
    );

  if (!session) {
    return NextResponse.json(
      { error: "Not logged in." },
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
  const writeLimit = await enforceRateLimit(req, { scope: "job-bid-create", identity: accountId, limit: 30, windowMs: 60 * 60 * 1000 });
  if (writeLimit) return writeLimit;

  const bidderAccount = await prisma.account.findUnique({
    where: { id: accountId },
    select: { verificationStatus: true, companyVerificationStatus: true, isTester: true, country: true, currency: true },
  });
  if (bidderAccount?.country === "IN" && bidderAccount?.currency === "INR") {
    return NextResponse.json({ error: "Bidding is not available in India. Contact the poster about the fixed quote." }, { status: 403 });
  }
  if (bidderAccount?.verificationStatus !== "verified" && !bidderAccount?.isTester) {
    return NextResponse.json(
      { error: "Your account must be verified before placing bids." },
      { status: 403 }
    );
  }

  if (bidderAccount?.companyVerificationStatus !== "verified" && !bidderAccount?.isTester) {
    return NextResponse.json({ error: "Company verification is required before bidding." }, { status: 403 });
  }

  const marketplaceAccessCheck = await getAccountAccess(accountId);

  if (!marketplaceAccessCheck.allowed) {
    return NextResponse.json(
      {
        error: "Marketplace access is unavailable.",
        reason: marketplaceAccessCheck.reason,
      },
      {
        status:
          marketplaceAccessCheck.reason === "access_expired"
            ? 402
            : 403,
      }
    );
  }

  const job =
    await prisma.job.findUnique({
      where: {
        id: routeParams.id,
      },
    });

  if (!job) {
    return NextResponse.json(
      {
        error: "Job not found.",
      },
      { status: 404 }
    );
  }

  if (job.posterId === accountId) {
    return NextResponse.json(
      { error: "You cannot bid on your own job." },
      { status: 403 }
    );
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

  if (
    job.priceMode !== "bid"
  ) {
    return NextResponse.json(
      {
        error:
          "This job is not open to bidding.",
      },
      { status: 400 }
    );
  }

  if (!bidderAccount?.isTester) {
    const bidderMarket = getLocalisationProfile({ country: bidderAccount.country, currency: bidderAccount.currency });
    const marketToday = marketDateKey(new Date(), bidderMarket?.timeZone ?? "UTC");
    const dateCutoff = new Date(marketToday + "T00:00:00.000Z");
    const matchingVehicle = await prisma.vehicle.findFirst({
      where: {
        accountId,
        vehicleType: job.vehicleType,
        verificationStatus: "verified",
        insuranceValidUntil: { gte: dateCutoff },
        ...(bidderMarket?.inspectionRequiredAtCountryLevel ? { motValidUntil: { gte: dateCutoff } } : {}),
      },
      select: { id: true },
    });
    if (!matchingVehicle) {
      return NextResponse.json(
        { error: "You need a verified vehicle of the required type with current insurance and any required inspection before placing a bid." },
        { status: 403 }
      );
    }
  }

  if (job.status !== "open") {
    return NextResponse.json(
      {
        error:
          "This job is no longer open.",
      },
      { status: 409 }
    );
  }

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      { error: "Invalid request body." },
      { status: 400 }
    );
  }

  const rawAmount =
    body && typeof body === "object" && "amount" in body
      ? (body as { amount?: unknown }).amount
      : undefined;
  const amount =
    typeof rawAmount === "number"
      ? rawAmount
      : typeof rawAmount === "string" && rawAmount.trim() !== ""
        ? Number(rawAmount)
        : Number.NaN;

  if (!Number.isFinite(amount) || amount <= 0 || amount > 100000000) {
    return NextResponse.json(
      { error: "Enter a bid amount greater than zero and no more than 100,000,000." },
      { status: 400 }
    );
  }

  let bid;
  try {
    bid = await prisma.$transaction(async (tx) => {
      // Serialize bid creation against acceptance/cancellation transitions.
      const lockedJobs = await tx.$queryRaw<Array<{
        id: string;
        posterId: string;
        status: string;
        priceMode: string;
      }>>`SELECT "id", "posterId", "status", "priceMode" FROM "Job" WHERE "id" = ${routeParams.id} FOR UPDATE`;
      const currentJob = lockedJobs[0];
      if (!currentJob || currentJob.status !== "open" || currentJob.priceMode !== "bid" || currentJob.posterId === accountId) {
        return null;
      }

      const createdBid = await tx.bid.create({
        data: {
          jobId: routeParams.id,
          bidderId: accountId,
          amount,
        },
      });

      await tx.jobActivity.create({
        data: {
          jobId: routeParams.id,
          actorId: accountId,
          action: "BID_PLACED",
          fromStatus: "open",
          toStatus: "open",
          description: "A driver submitted a bid for the job.",
          metadata: { bidId: createdBid.id, amount },
        },
      });

      await tx.notification.create({
        data: {
          accountId: currentJob.posterId,
          type: "new_bid",
          title: "A driver placed a bid",
          body: `A driver submitted a bid for job ${routeParams.id}. Review bids from the jobs page.`,
          jobId: routeParams.id,
          eventKey: `bid-placed:${createdBid.id}`,
          metadata: { bidId: createdBid.id, amount },
        },
      });

      return createdBid;
    });
  } catch (error) {
    console.error("Place bid error:", error);
    return NextResponse.json({ error: "Unable to place bid right now. Please retry." }, { status: 500 });
  }

  if (!bid) {
    return NextResponse.json({ error: "This job is no longer open to bidding. Refresh and try again." }, { status: 409 });
  }

  await markDriverOpportunityBid(accountId, routeParams.id);

  return NextResponse.json({
    success: true,
    bid,
  });
}
export const POST = withApiMetrics("/api/jobs/[id]/bid", POSTHandler);
