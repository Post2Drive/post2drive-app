import { notify } from "@/lib/notify";
import { withApiMetrics } from "@/lib/apiMetrics";
import { enforceRateLimit } from "@/lib/rateLimit";
import { requireJobMarketAccess } from "@/lib/jobMarket";
import { readBoundedJson } from "@/lib/requestBody";
import { canTransition } from "@/lib/jobTransitions";
import { isDisputeReason } from "@/lib/disputes";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Either party can open a dispute on a job that is in transit or delivered.
// The job then waits for an administrator (see /api/admin/disputes/resolve).
async function POSTHandler(req: Request, { params }: { params: Promise<{ id: string }> }) {
  const routeParams = await params;
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Not logged in." }, { status: 401 });

  const accountId = (session.user as any)?.accountId;
  if (!accountId) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  const marketAccessError = await requireJobMarketAccess(accountId, routeParams.id);
  if (marketAccessError) return marketAccessError;
  const writeLimit = await enforceRateLimit(req, { scope: "job-dispute", identity: accountId, limit: 10, windowMs: 60 * 60 * 1000 });
  if (writeLimit) return writeLimit;

  const parsedBody = await readBoundedJson(req, 8 * 1024);
  if (!parsedBody.ok) {
    return NextResponse.json(
      { error: parsedBody.status === 413 ? "Request body is too large." : "Request body must be valid JSON." },
      { status: parsedBody.status },
    );
  }
  if (!parsedBody.value || typeof parsedBody.value !== "object" || Array.isArray(parsedBody.value)) {
    return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
  }
  const body = parsedBody.value as Record<string, unknown>;
  const reason = body.reason;
  const notes = typeof body.notes === "string" ? body.notes.trim() : "";
  if (!isDisputeReason(reason)) return NextResponse.json({ error: "Choose a reason for the dispute." }, { status: 400 });
  if (!notes || notes.length > 4000) return NextResponse.json({ error: "Explain what went wrong (maximum 4000 characters)." }, { status: 400 });

  const job = await prisma.job.findUnique({
    where: { id: routeParams.id },
    select: { id: true, status: true, posterId: true, acceptedById: true },
  });
  if (!job) return NextResponse.json({ error: "Job not found." }, { status: 404 });

  if (job.posterId !== accountId && job.acceptedById !== accountId) {
    return NextResponse.json({ error: "You're not involved in this job." }, { status: 403 });
  }

  if (job.status === "disputed") {
    return NextResponse.json({ error: "This job is already under review." }, { status: 409 });
  }
  if (job.status !== "in_transit" && job.status !== "delivered") {
    return NextResponse.json({ error: "A dispute can only be opened once the job is in transit or delivered." }, { status: 409 });
  }
  if (!canTransition(job.status, "disputed")) {
    return NextResponse.json({ error: "This job cannot be disputed in its current state." }, { status: 409 });
  }

  const openerRole = job.posterId === accountId ? "poster" : "driver";
  const otherPartyId = openerRole === "poster" ? job.acceptedById : job.posterId;

  const updated = await prisma.$transaction(async (tx) => {
    const transition = await tx.job.updateMany({
      where: { id: routeParams.id, status: job.status, posterId: job.posterId, acceptedById: job.acceptedById },
      data: { status: "disputed" },
    });
    if (transition.count !== 1) return null;

    const changedJob = await tx.job.findUniqueOrThrow({ where: { id: routeParams.id } });
    const activity = await tx.jobActivity.create({
      data: {
        jobId: routeParams.id,
        actorId: accountId,
        action: "DISPUTE_OPENED",
        fromStatus: job.status,
        toStatus: "disputed",
        description: `The ${openerRole} opened a dispute; the job is under review.`,
        metadata: {
          schemaVersion: 1,
          reason,
          notes,
          openedByRole: openerRole,
          previousStatus: job.status,
        },
      },
    });

    if (otherPartyId && otherPartyId !== accountId) {
      await notify(tx, {
        accountId: otherPartyId,
        type: "dispute_opened",
        title: `The ${openerRole} opened a dispute`,
        body: `A dispute was opened for job ${routeParams.id}. The job is under review and cannot change until an administrator decides. You can see the details in the job history.`,
        jobId: routeParams.id,
        eventKey: `dispute-opened:${activity.id}:${otherPartyId}`,
        metadata: { openedByRole: openerRole, reason },
      });
    }
    return changedJob;
  });

  if (!updated) {
    return NextResponse.json({ error: "This job's state has already changed. Refresh and try again." }, { status: 409 });
  }

  return NextResponse.json({ success: true, job: updated }, { status: 201 });
}

export const POST = withApiMetrics("/api/jobs/[id]/dispute", POSTHandler);
