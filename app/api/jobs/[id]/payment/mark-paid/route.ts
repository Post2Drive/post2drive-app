import { withApiMetrics } from "@/lib/apiMetrics";
import { requireJobMarketAccess } from "@/lib/jobMarket";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { recordJobActivity } from "@/lib/jobActivity";

// POST /api/jobs/[id]/payment/mark-paid — poster declares they've paid.
// This is a declaration for reconciliation only — the platform never
// handles or verifies the actual money movement.
async function POSTHandler(
  req: Request,
  { params }: { params: Promise<{ id: string }> }
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

  const job = await prisma.job.findUnique({
    where: { id: routeParams.id },
  });

  if (!job) {
    return NextResponse.json({ error: "Job not found." }, { status: 404 });
  }

  if (job.posterId !== accountId) {
    return NextResponse.json(
      { error: "Only the poster can mark this paid." },
      { status: 403 }
    );
  }

  if (job.status !== "completed") {
    return NextResponse.json(
      { error: "Only a completed job can be marked paid." },
      { status: 409 }
    );
  }

  const updated = await prisma.job.update({
    where: { id: routeParams.id },
    data: {
      paidMarkedById: accountId,
      paidMarkedAt: new Date(),
    },
  });

  await recordJobActivity({
    jobId: routeParams.id,
    actorId: accountId,
    action: "PAYMENT_MARKED_PAID",
    description:
      "The poster marked the job payment as paid. This is a declaration only and not a verified bank transaction.",
  });

  return NextResponse.json({
    success: true,
    job: updated,
  });
}
export const POST = withApiMetrics("/api/jobs/[id]/payment/mark-paid", POSTHandler);
