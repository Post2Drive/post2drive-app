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

  return NextResponse.json({
    job,
  });
}
export const GET = withApiMetrics("/api/jobs/[id]", GETHandler);
