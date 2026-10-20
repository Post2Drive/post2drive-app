import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { withApiMetrics } from "@/lib/apiMetrics";

export const dynamic = "force-dynamic";

async function GETHandler(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const session = await getServerSession(authOptions);
    if (!session) {
      return NextResponse.json({ error: "Not logged in." }, { status: 401 });
    }

    const viewerAccountId = (session.user as any)?.accountId as string | undefined;
    if (!viewerAccountId) {
      return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }

    const viewer = await prisma.account.findUnique({
      where: { id: viewerAccountId },
      select: { country: true, currency: true, deletionRequestedAt: true },
    });
    if (!viewer || viewer.deletionRequestedAt) {
      return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }

    const { id: displayId } = await params;
    const target = await prisma.account.findFirst({
      where: { displayId, deletionRequestedAt: null },
      select: {
        id: true,
        companyName: true,
        displayId: true,
        isSoleTrader: true,
        country: true,
        currency: true,
        createdAt: true,
        vehicles: {
          orderBy: { createdAt: "desc" },
          take: 20,
          select: { id: true, vehicleType: true, regPlate: true },
        },
        ratingsReceived: {
          orderBy: { createdAt: "desc" },
          take: 5,
          select: { id: true, stars: true, comment: true, createdAt: true },
        },
      },
    });

    // Do not disclose whether an account exists in another marketplace.
    if (!target || target.country !== viewer.country || target.currency !== viewer.currency) {
      return NextResponse.json({ error: "Profile not found in your marketplace." }, { status: 404 });
    }

    const [ratingAggregate, jobsPosted, jobsCompleted] = await Promise.all([
      prisma.rating.aggregate({
        where: { rateeId: target.id },
        _avg: { stars: true },
        _count: { _all: true },
      }),
      prisma.job.count({ where: { posterId: target.id } }),
      prisma.job.count({ where: { posterId: target.id, status: "completed" } }),
    ]);

    const publicAccount = {
      companyName: target.companyName,
      displayId: target.displayId,
      isSoleTrader: target.isSoleTrader,
      country: target.country,
      createdAt: target.createdAt,
      vehicles: target.vehicles,
    };
    return NextResponse.json({
      account: publicAccount,
      avgRating: ratingAggregate._avg.stars,
      ratingCount: ratingAggregate._count._all,
      recentRatings: target.ratingsReceived,
      jobsPosted,
      jobsCompleted,
    });
  } catch (error) {
    console.error("public profile lookup failed:", error);
    return NextResponse.json({ error: "Could not load this profile. Try again." }, { status: 500 });
  }
}

export const GET = withApiMetrics("/api/profile/[id]", GETHandler);
