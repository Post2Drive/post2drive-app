import { withApiMetrics } from "@/lib/apiMetrics";
import { requireJobMarketAccess } from "@/lib/jobMarket";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// POST /api/jobs/[id]/payment/confirm-received — driver confirms received payment.
// This is a declaration only; the platform does not verify bank transactions.
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
  if (job.acceptedById !== accountId) {
    return NextResponse.json({ error: "Only the driver who did this job can confirm receipt." }, { status: 403 });
  }
  if (job.status !== "completed") {
    return NextResponse.json({ error: "Only a completed job's payment can be confirmed received." }, { status: 409 });
  }
  if (!job.paidMarkedAt) {
    return NextResponse.json({ error: "The poster must mark the payment as paid before you can confirm receipt." }, { status: 409 });
  }
  if (job.receivedConfirmedAt) {
    return NextResponse.json({ error: "Payment receipt has already been confirmed." }, { status: 409 });
  }

  const outcome = await prisma.$transaction(async (tx) => {
    const confirmedAt = new Date();
    const transition = await tx.job.updateMany({
      where: {
        id: routeParams.id,
        acceptedById: accountId,
        status: "completed",
        paidMarkedAt: { not: null },
        receivedConfirmedAt: null,
      },
      data: { receivedConfirmedById: accountId, receivedConfirmedAt: confirmedAt },
    });

    if (transition.count !== 1) {
      const current = await tx.job.findUnique({
        where: { id: routeParams.id },
        select: { status: true, acceptedById: true, paidMarkedAt: true, receivedConfirmedAt: true },
      });
      if (!current || current.status !== "completed" || current.acceptedById !== accountId) return "job_changed" as const;
      if (!current.paidMarkedAt) return "payment_not_marked" as const;
      if (current.receivedConfirmedAt) return "already_confirmed" as const;
      return "job_changed" as const;
    }

    const updated = await tx.job.findUniqueOrThrow({ where: { id: routeParams.id } });
    await tx.jobActivity.create({
      data: {
        jobId: routeParams.id,
        actorId: accountId,
        action: "PAYMENT_RECEIVED_CONFIRMED",
        fromStatus: "completed",
        toStatus: "completed",
        description: "The driver confirmed that payment was received. This is a declaration only and not a verified bank transaction.",
      },
    });
    return { kind: "updated" as const, job: updated };
  });

  if (outcome === "payment_not_marked") {
    return NextResponse.json({ error: "The poster must mark the payment as paid before you can confirm receipt." }, { status: 409 });
  }
  if (outcome === "already_confirmed") {
    return NextResponse.json({ error: "Payment receipt has already been confirmed." }, { status: 409 });
  }
  if (outcome === "job_changed") {
    return NextResponse.json({ error: "The job payment state changed. Refresh and try again." }, { status: 409 });
  }

  return NextResponse.json({ success: true, job: outcome.job });
}
export const POST = withApiMetrics("/api/jobs/[id]/payment/confirm-received", POSTHandler);
