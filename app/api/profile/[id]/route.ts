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
      select: { country: true, currency: true, deletionRequestedAt: true, verificationStatus: true },
    });
    if (!viewer || viewer.deletionRequestedAt) {
      return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }

    if (viewer.verificationStatus === "suspended") {
      return NextResponse.json({ error: "Suspended accounts cannot access marketplace profiles." }, { status: 403 });
    }

    const { id: displayId } = await params;
    const target = await prisma.account.findFirst({
      where: { displayId, deletionRequestedAt: null, verificationStatus: { not: "suspended" } },
      select: { id: true, country: true, currency: true },
    });

    // Do not fetch any profile, vehicle or rating details until market access
    // is confirmed. A foreign-market account is indistinguishable from missing.
    if (!target || target.country !== viewer.country || target.currency !== viewer.currency) {
      return NextResponse.json({ error: "Profile not found in your marketplace." }, { status: 404 });
    }

    const now = new Date();
    const [profile, ratingAggregate, otherOutcomes, jobsPosted, jobsCompleted] = await Promise.all([
      prisma.account.findUnique({
        where: { id: target.id },
        select: {
          companyName: true,
          displayId: true,
          isSoleTrader: true,
          country: true,
          createdAt: true,
          vehicles: {
            orderBy: { createdAt: "desc" },
            take: 20,
            select: { vehicleType: true },
          },
          // Blind ratings: only show ratings whose visibility time has passed.
          ratingsReceived: {
            where: { visibleAfter: { lte: now } },
            orderBy: [{ createdAt: "desc" }, { id: "desc" }],
            take: 5,
            select: { id: true, stars: true, comment: true, createdAt: true, outcome: true, reasonCode: true },
          },
        },
      }),
      // The star average counts only normally completed jobs; jobs that did not
      // complete or were disputed are reported separately (fair rating policy §11).
      prisma.rating.aggregate({
        where: { rateeId: target.id, visibleAfter: { lte: now }, outcome: "completed" },
        _avg: { stars: true },
        _count: { _all: true },
      }),
      prisma.rating.groupBy({
        by: ["outcome"],
        where: { rateeId: target.id, visibleAfter: { lte: now }, outcome: { in: ["not_completed", "disputed"] } },
        _count: { _all: true },
      }),
      prisma.job.count({ where: { posterId: target.id } }),
      prisma.job.count({ where: { posterId: target.id, status: "completed" } }),
    ]);

    if (!profile) {
      return NextResponse.json({ error: "Profile not found in your marketplace." }, { status: 404 });
    }

    return NextResponse.json({
      account: profile,
      avgRating: ratingAggregate._avg.stars,
      ratingCount: ratingAggregate._count._all,
      notCompletedRatingCount: otherOutcomes.find((row: { outcome: string; _count: { _all: number } }) => row.outcome === "not_completed")?._count._all ?? 0,
      disputedRatingCount: otherOutcomes.find((row: { outcome: string; _count: { _all: number } }) => row.outcome === "disputed")?._count._all ?? 0,
      recentRatings: profile.ratingsReceived,
      jobsPosted,
      jobsCompleted,
    });
  } catch (error) {
    console.error("Public profile lookup failed.", { errorName: error instanceof Error ? error.name : "UnknownError" });
    return NextResponse.json({ error: "Could not load this profile. Try again." }, { status: 500 });
  }
}

export const GET = withApiMetrics("/api/profile/[id]", GETHandler);
