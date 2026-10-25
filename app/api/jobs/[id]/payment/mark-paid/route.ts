import { withApiMetrics } from "@/lib/apiMetrics";
import { requireJobMarketAccess } from "@/lib/jobMarket";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// POST /api/jobs/[id]/payment/mark-paid — poster declares they have paid.
// This is a reconciliation declaration, not a verified bank transaction.
async function POSTHandler(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const routeParams = await params;
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Not logged in." }, { status: 401 });

  const accountId = (session.user as any).accountId as string | undefined;
  if (!accountId) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  const marketAccessError = await requireJobMarketAccess(accountId, routeParams.id);
  if (marketAccessError) return marketAccessError;

  const job = await prisma.job.findUnique({ where: { id: routeParams.id } });
  if (!job) return NextResponse.json({ error: "Job not found." }, { status: 404 });
  if (job.posterId !== accountId) {
    return NextResponse.json({ error: "Only the poster can mark this paid." }, { status: 403 });
  }
  if (job.status !== "completed") {
    return NextResponse.json({ error: "Only a completed job can be marked paid." }, { status: 409 });
  }
  if (job.paidMarkedAt) {
    return NextResponse.json({ error: "Payment has already been marked paid." }, { status: 409 });
  }

  const outcome = await prisma.$transaction(async (tx) => {
    const markedAt = new Date();
    const transition = await tx.job.updateMany({
      where: {
        id: routeParams.id,
        posterId: accountId,
        status: "completed",
        paidMarkedAt: null,
      },
      data: { paidMarkedById: accountId, paidMarkedAt: markedAt },
    });

    if (transition.count !== 1) {
      const current = await tx.job.findUnique({
        where: { id: routeParams.id },
        select: { status: true, paidMarkedAt: true },
      });
      if (!current || current.status !== "completed") return "job_changed" as const;
      if (current.paidMarkedAt) return "already_marked" as const;
      return "job_changed" as const;
    }

    const updated = await tx.job.findUniqueOrThrow({ where: { id: routeParams.id } });
    await tx.jobActivity.create({
      data: {
        jobId: routeParams.id,
        actorId: accountId,
        action: "PAYMENT_MARKED_PAID",
        fromStatus: "completed",
        toStatus: "completed",
        description: "The poster marked the job payment as paid. This is a declaration only and not a verified bank transaction.",
      },
    });
    return { kind: "updated" as const, job: updated };
  });

  if (outcome === "already_marked") {
    return NextResponse.json({ error: "Payment has already been marked paid." }, { status: 409 });
  }
  if (outcome === "job_changed") {
    return NextResponse.json({ error: "The job payment state changed. Refresh and try again." }, { status: 409 });
  }

  return NextResponse.json({ success: true, job: outcome.job });
}
export const POST = withApiMetrics("/api/jobs/[id]/payment/mark-paid", POSTHandler);
