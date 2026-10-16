import { withApiMetrics } from "@/lib/apiMetrics";
import { requireJobMarketAccess } from "@/lib/jobMarket";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

async function GETHandler(
  req: Request,
  {
    params,
  }: {
    params: Promise<{
      id: string;
    }>;
  }
) {
  const { id } = await params;

  const session =
    await getServerSession(
      authOptions
    );

  if (!session) {
    return NextResponse.json(
      {
        error: "Not logged in.",
      },
      { status: 401 }
    );
  }

  const accountId =
    (session.user as any)
      ?.accountId;
  if (!accountId) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }
  const marketAccessError = await requireJobMarketAccess(accountId, id);
  if (marketAccessError) return marketAccessError;

  const job =
    await prisma.job.findUnique({
      where: {
        id: id,
      },
      select: {
        id: true,
        posterId: true,
        acceptedById: true,
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

  const involved =
    job.posterId === accountId ||
    job.acceptedById === accountId;

  if (!involved) {
    return NextResponse.json(
      {
        error:
          "You are not involved in this job.",
      },
      { status: 403 }
    );
  }

  const activities =
    await prisma.jobActivity.findMany({
      where: {
        jobId: id,
      },

      orderBy: {
        createdAt: "desc",
      },

      include: {
        actor: {
          select: {
            id: true,
            companyName: true,
            displayId: true,
          },
        },
      },
    });

  return NextResponse.json({
    success: true,
    activities,
  });
}
export const GET = withApiMetrics("/api/jobs/[id]/activity", GETHandler);
