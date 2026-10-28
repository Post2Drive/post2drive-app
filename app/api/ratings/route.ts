import { withApiMetrics } from "@/lib/apiMetrics";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { readBoundedJson } from "@/lib/requestBody";
import { prisma } from "@/lib/prisma";

// POST /api/ratings — rate the other party on a job you were matched on.
// Ratings are allowed regardless of the job's final status.
async function POSTHandler(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) {
    return NextResponse.json({ error: "Not logged in." }, { status: 401 });
  }

  const accountId = (session.user as any).accountId;
  if (!accountId) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

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
  const { jobId, stars, comment } = body;
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

  const job = await prisma.job.findUnique({
    where: { id: jobId },
    select: { id: true, posterId: true, acceptedById: true },
  });
  if (!job) {
    return NextResponse.json({ error: "Job not found." }, { status: 404 });
  }

  let rateeId: string | null = null;

  if (job.posterId === accountId) {
    rateeId = job.acceptedById;
    if (!rateeId) {
      const previousMatch = await prisma.jobActivity.findFirst({
        where: { jobId, action: "DRIVER_BACKED_OUT", actorId: { not: null } },
        orderBy: { createdAt: "desc" },
        select: { actorId: true },
      });
      rateeId = previousMatch?.actorId ?? null;
    }
  } else if (job.acceptedById === accountId) {
    rateeId = job.posterId;
  } else {
    const previousMatch = await prisma.jobActivity.findFirst({
      where: { jobId, action: "DRIVER_BACKED_OUT", actorId: accountId },
      select: { id: true },
    });
    if (previousMatch) rateeId = job.posterId;
  }
  if (!rateeId) {
    return NextResponse.json(
      { error: "You can only rate someone you were actually matched with on this job." },
      { status: 403 }
    );
  }

  // Use INSERT ... ON CONFLICT DO NOTHING through Prisma's PostgreSQL
  // skipDuplicates support. The unique (jobId, raterId) constraint remains
  // the final concurrency guard, without turning expected racing duplicates
  // into noisy Prisma P2002 error logs.
  const result = await prisma.rating.createMany({
    data: [{
      jobId,
      raterId: accountId,
      rateeId,
      stars: numericStars,
      comment: typeof comment === "string" && comment.trim() ? comment.trim() : null,
    }],
    skipDuplicates: true,
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
