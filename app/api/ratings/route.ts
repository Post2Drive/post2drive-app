import { withApiMetrics } from "@/lib/apiMetrics";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { readBoundedJson } from "@/lib/requestBody";
import { prisma } from "@/lib/prisma";
import { requireJobMarketAccess } from "@/lib/jobMarket";
import { enforceRateLimit } from "@/lib/rateLimit";
import { initialVisibleAfter, isRatingReasonCode, ratingEligibility, ratingReasonRequired, RATING_REASONS } from "@/lib/ratingPolicy";

// POST /api/ratings — rate the other party on a job you were matched on.
// When a job can be rated, with what outcome label, and whether a reason is
// required are decided by lib/ratingPolicy.ts (fair rating policy, §11).
async function POSTHandler(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Not logged in." }, { status: 401 });
  }

  const accountId = (session.user as any).accountId;
  if (!accountId) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const rateLimit = await enforceRateLimit(req, {
    scope: "rating-submit",
    identity: accountId,
    limit: 20,
    windowMs: 60 * 60 * 1000,
  });
  if (rateLimit) return rateLimit;

  const parsedBody = await readBoundedJson(req, 8 * 1024);
  if (!parsedBody.ok) {
    return NextResponse.json(
      { error: parsedBody.status === 413 ? "Request body is too large." : "Invalid request body." },
      { status: parsedBody.status },
    );
  }
  if (!parsedBody.value || typeof parsedBody.value !== "object" || Array.isArray(parsedBody.value)) {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const body = parsedBody.value as Record<string, unknown>;
  const { jobId, stars, comment, reasonCode } = body;
  const numericStars = Number(stars);

  if (
    typeof jobId !== "string" ||
    !jobId.trim() ||
    !Number.isInteger(numericStars) ||
    numericStars < 1 ||
    numericStars > 5
  ) {
    return NextResponse.json({ error: "A job and a 1-5 star rating are required." }, { status: 400 });
  }

  if (comment != null && (typeof comment !== "string" || comment.length > 1000)) {
    return NextResponse.json({ error: "Comments must be 1,000 characters or fewer." }, { status: 400 });
  }

  if (reasonCode != null && !isRatingReasonCode(reasonCode)) {
    return NextResponse.json({ error: "Choose a reason from the list." }, { status: 400 });
  }

  const marketAccessError = await requireJobMarketAccess(accountId, jobId);
  if (marketAccessError) return marketAccessError;

  const job = await prisma.job.findUnique({
    where: { id: jobId },
    select: { id: true, posterId: true, acceptedById: true, status: true, cancelledAt: true },
  });
  if (!job) {
    return NextResponse.json({ error: "Job not found." }, { status: 404 });
  }

  // Only the two parties who actually worked the job may rate each other.
  // Drivers who backed out before pickup are handled by the cancellation record, not ratings.
  let rateeId: string | null = null;
  if (job.posterId === accountId) rateeId = job.acceptedById;
  else if (job.acceptedById && job.acceptedById === accountId) rateeId = job.posterId;
  if (!rateeId || rateeId === accountId) {
    return NextResponse.json(
      { error: "You can only rate someone you were actually matched with on this job." },
      { status: 403 }
    );
  }

  const latest = (action: string) => prisma.jobActivity.findFirst({
    where: { jobId, action }, orderBy: { createdAt: "desc" }, select: { createdAt: true },
  });
  const [pickup, marked, confirmed] = await Promise.all([
    latest("PICKUP_CONFIRMED"),
    latest("DELIVERY_MARKED"),
    latest("DELIVERY_CONFIRMED"),
  ]);

  const now = new Date();
  const eligibility = ratingEligibility({
    status: job.status,
    cancelledAt: job.cancelledAt,
    pickupConfirmedAt: pickup?.createdAt ?? null,
    deliveryMarkedAt: marked?.createdAt ?? null,
    deliveryConfirmedAt: confirmed?.createdAt ?? null,
  }, now);
  if (!eligibility.allowed) {
    return NextResponse.json(
      { error: eligibility.message, reason: eligibility.code, opensAt: eligibility.opensAt ?? null },
      { status: 409 },
    );
  }

  if (ratingReasonRequired(numericStars, eligibility.outcome) && !reasonCode) {
    return NextResponse.json({
      error: eligibility.outcome === "completed"
        ? "Please choose a reason for a 1 or 2 star rating."
        : "Please choose a reason: this job did not complete normally.",
      reasons: RATING_REASONS,
    }, { status: 400 });
  }
  const trimmedComment = typeof comment === "string" && comment.trim() ? comment.trim() : null;
  if (reasonCode === "other" && !trimmedComment) {
    return NextResponse.json({ error: "Please explain the reason in the comment." }, { status: 400 });
  }

  // Use INSERT ... ON CONFLICT DO NOTHING through Prisma's PostgreSQL
  // skipDuplicates support. The unique (jobId, raterId) constraint remains
  // the final concurrency guard, without turning expected racing duplicates
  // into noisy Prisma P2002 error logs.
  const result = await prisma.$transaction(async (tx) => {
    const counterpart = await tx.rating.findUnique({
      where: { jobId_raterId: { jobId, raterId: rateeId! } },
      select: { id: true },
    });
    const created = await tx.rating.createMany({
      data: [{
        jobId,
        raterId: accountId,
        rateeId: rateeId!,
        stars: numericStars,
        comment: trimmedComment,
        outcome: eligibility.outcome,
        reasonCode: typeof reasonCode === "string" ? reasonCode : null,
        visibleAfter: initialVisibleAfter(eligibility, Boolean(counterpart), now),
      }],
      skipDuplicates: true,
    });
    // Blind ratings: once both sides have rated, both become visible.
    if (created.count === 1 && counterpart) {
      await tx.rating.update({ where: { id: counterpart.id }, data: { visibleAfter: now } });
    }
    return created;
  });

  if (result.count !== 1) {
    return NextResponse.json({ error: "You've already rated this job." }, { status: 409 });
  }

  const rating = await prisma.rating.findUnique({
    where: { jobId_raterId: { jobId, raterId: accountId } },
  });

  return NextResponse.json({ success: true, rating });
}

export const POST = withApiMetrics("/api/ratings", POSTHandler);
