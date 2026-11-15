import { withApiMetrics } from "@/lib/apiMetrics";
import { requireJobMarketAccess } from "@/lib/jobMarket";
import { PROOF_STAGE_REMOVABLE_STATUSES, isProofStage } from "@/lib/proofPhotos";
import { enforceRateLimit } from "@/lib/rateLimit";
import { isTesterAdmin } from "@/lib/testerAdmin";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type RouteContext = { params: Promise<{ id: string; photoId: string }> };

async function GETHandler(_req: Request, { params }: RouteContext) {
  const { id: jobId, photoId } = await params;
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Not logged in." }, { status: 401 });
  const accountId = (session.user as any)?.accountId;
  if (!accountId) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  const admin = await isTesterAdmin();
  if (!admin) {
    const marketAccessError = await requireJobMarketAccess(accountId, jobId);
    if (marketAccessError) return marketAccessError;
  }

  const photo = await prisma.jobProofPhoto.findFirst({
    where: { id: photoId, jobId, OR: [{ expiresAt: { gt: new Date() } }, { job: { status: "disputed" } }] },
    select: { content: true, mimeType: true, sha256: true, job: { select: { posterId: true, acceptedById: true } } },
  });
  if (!photo) return NextResponse.json({ error: "Photo not found." }, { status: 404 });
  const isParty = photo.job.posterId === accountId || photo.job.acceptedById === accountId;
  if (!isParty && !admin) return NextResponse.json({ error: "You're not involved in this job." }, { status: 403 });

  return new Response(new Uint8Array(photo.content), {
    status: 200,
    headers: {
      "Content-Type": photo.mimeType,
      "Content-Length": String(photo.content.byteLength),
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
      ETag: `"${photo.sha256}"`,
    },
  });
}

// A person can take back a photo they added, until they submit that step.
async function DELETEHandler(req: Request, { params }: RouteContext) {
  const { id: jobId, photoId } = await params;
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Not logged in." }, { status: 401 });
  const accountId = (session.user as any)?.accountId;
  if (!accountId) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  const marketAccessError = await requireJobMarketAccess(accountId, jobId);
  if (marketAccessError) return marketAccessError;
  const writeLimit = await enforceRateLimit(req, { scope: "job-proof-remove", identity: accountId, limit: 30, windowMs: 60 * 60 * 1000 });
  if (writeLimit) return writeLimit;

  const result = await prisma.$transaction(async (tx) => {
    // Lock the job so the status cannot move on while the photo is removed.
    await tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "Job" WHERE "id" = ${jobId} FOR UPDATE`;
    const photo = await tx.jobProofPhoto.findFirst({ where: { id: photoId, jobId }, select: { id: true, stage: true, uploadedById: true } });
    if (!photo) return { error: "Photo not found.", status: 404 } as const;
    // Only the person who added it; the other side's photos are never theirs to remove.
    if (photo.uploadedById !== accountId) return { error: "You can only remove photos you added.", status: 403 } as const;
    const job = await tx.job.findUnique({ where: { id: jobId }, select: { status: true } });
    if (!job || !isProofStage(photo.stage) || !PROOF_STAGE_REMOVABLE_STATUSES[photo.stage].includes(job.status)) {
      return { error: "This step has been submitted, so its photos are kept as a record.", status: 409 } as const;
    }
    await tx.jobProofPhoto.deleteMany({ where: { id: photoId, jobId, uploadedById: accountId } });
    return { ok: true } as const;
  });

  if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });
  return NextResponse.json({ success: true });
}

export const GET = withApiMetrics("/api/jobs/[id]/proof/[photoId]", GETHandler);
export const DELETE = withApiMetrics("/api/jobs/[id]/proof/[photoId]", DELETEHandler);
