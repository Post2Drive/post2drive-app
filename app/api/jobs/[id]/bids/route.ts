import { withApiMetrics } from "@/lib/apiMetrics";
import { requireJobMarketAccess } from "@/lib/jobMarket";
import { getAccountAccess } from "@/lib/access";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

async function GETHandler(
  _req: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  const routeParams = await params;
  const session = await getServerSession(authOptions);

  if (!session) {
    return NextResponse.json(
      { error: "Not logged in." },
      { status: 401 },
    );
  }

  const accountId = (session.user as any).accountId;
  if (!accountId) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }
  const marketAccessError = await requireJobMarketAccess(accountId, routeParams.id);
  if (marketAccessError) return marketAccessError;

const job = await prisma.job.findUnique({
    where: {
      id: routeParams.id,
    },
    select: {
      id: true,
      posterId: true,
      status: true,
      price: true,
      priceMode: true,
      currency: true,
      acceptedById: true,
    },
  });

  if (!job) {
    return NextResponse.json(
      { error: "Job not found." },
      { status: 404 },
    );
  }

  if (job.posterId !== accountId) {
    return NextResponse.json(
      {
        error:
          "Only the poster can view bids on this job.",
      },
      { status: 403 },
    );
  }

  /*
   * Once a job is no longer open, there are no actionable
   * bids left. Return an empty active-bid list rather than
   * exposing stale offers.
   */
  if (job.status !== "open") {
    return NextResponse.json({
      bids: [],
      jobStatus: job.status,
    });
  }

  /*
   * Clean up any invalidated bids that somehow remain active.
   * The update is deliberately restricted to this job.
   */
  const activeBids = await prisma.bid.findMany({
    where: {
      jobId: routeParams.id,
      status: "active",
    },
    include: {
      bidder: {
        select: {
          companyName: true,
          displayId: true,
          createdAt: true,
          verificationStatus: true,
          isTester: true,
        },
      },
    },
    orderBy: [
      {
        amount: "asc",
      },
      {
        createdAt: "asc",
      },
    ],
  });

  /*
   * A bid from a driver who is no longer verified should not
   * remain actionable. Mark it invalidated before returning
   * the final list.
   */
  const unverifiedBidIds = activeBids
    .filter(
      (bid) =>
        bid.bidder.verificationStatus !== "verified" && !bid.bidder.isTester,
    )
    .map((bid) => bid.id);

  if (unverifiedBidIds.length > 0) {
    await prisma.bid.updateMany({
      where: {
        id: {
          in: unverifiedBidIds,
        },
        jobId: routeParams.id,
        status: "active",
      },
      data: {
        status: "invalidated",
      },
    });
  }

  const bids = activeBids
    .filter(
      (bid) =>
        !unverifiedBidIds.includes(bid.id),
    )
    .map((bid) => ({
      id: bid.id,
      jobId: bid.jobId,
      bidderId: bid.bidderId,
      amount: bid.amount,
      status: bid.status,
      createdAt: bid.createdAt,
      bidder: {
        companyName: bid.bidder.companyName,
        displayId: bid.bidder.displayId,
        createdAt: bid.bidder.createdAt,
      },
    }));

  return NextResponse.json({
    bids,
    jobStatus: job.status,
  });
}
export const GET = withApiMetrics("/api/jobs/[id]/bids", GETHandler);
