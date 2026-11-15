import { withApiMetrics } from "@/lib/apiMetrics";
import { requireJobMarketAccess } from "@/lib/jobMarket";
import {
  MAX_PROOF_PHOTOS_PER_STAGE,
  MAX_PROOF_UPLOAD_BYTES,
  PROOF_STAGE_JOB_STATUS,
  isProofStage,
  processProofPhoto,
  proofExpiry,
  purgeProofPhotosSometimes,
} from "@/lib/proofPhotos";
import { enforceRateLimit } from "@/lib/rateLimit";
import { readBoundedBytes } from "@/lib/requestBody";
import { isTesterAdmin } from "@/lib/testerAdmin";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type RouteContext = { params: Promise<{ id: string }> };

const PHOTO_SELECT = { id: true, stage: true, width: true, height: true, sizeBytes: true, createdAt: true, expiresAt: true } as const;

// The accepted driver adds a photo at pickup (job accepted) or delivery (job in transit).
async function POSTHandler(req: Request, { params }: RouteContext) {
  const { id: jobId } = await params;
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Not logged in." }, { status: 401 });
  const accountId = (session.user as any)?.accountId;
  if (!accountId) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  const marketAccessError = await requireJobMarketAccess(accountId, jobId);
  if (marketAccessError) return marketAccessError;
  const writeLimit = await enforceRateLimit(req, { scope: "job-proof-upload", identity: accountId, limit: 30, windowMs: 60 * 60 * 1000 });
  if (writeLimit) return writeLimit;

  const job = await prisma.job.findUnique({ where: { id: jobId }, select: { id: true, status: true, acceptedById: true } });
  if (!job) return NextResponse.json({ error: "Job not found." }, { status: 404 });
  if (job.acceptedById !== accountId) {
    return NextResponse.json({ error: "Only the driver on this job can add proof photos." }, { status: 403 });
  }

  const body = await readBoundedBytes(req, MAX_PROOF_UPLOAD_BYTES + 256 * 1024);
  if (!body.ok) {
    return NextResponse.json(
      { error: body.status === 413 ? "Photo is too large (maximum 10 MB)." : "Upload body is invalid." },
      { status: body.status },
    );
  }
  const buffer = new ArrayBuffer(body.bytes.byteLength);
  new Uint8Array(buffer).set(body.bytes);
  const headers = new Headers(req.headers);
  headers.delete("content-length");
  let form: FormData;
  try {
    form = await new Request(req.url, { method: "POST", headers, body: buffer }).formData();
  } catch {
    return NextResponse.json({ error: "Upload must use multipart form data." }, { status: 400 });
  }

  const stage = form.get("stage");
  if (!isProofStage(stage)) return NextResponse.json({ error: "Stage must be pickup or delivery." }, { status: 400 });
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Choose a photo to upload." }, { status: 400 });
  if (file.size <= 0 || file.size > MAX_PROOF_UPLOAD_BYTES) {
    return NextResponse.json({ error: "Photos must be between 1 byte and 10 MB." }, { status: 413 });
  }
  const requiredStatus = PROOF_STAGE_JOB_STATUS[stage];
  if (job.status !== requiredStatus) {
    return NextResponse.json(
      { error: stage === "pickup" ? "Pickup photos can be added before the job is collected." : "Delivery photos can be added while the job is in transit." },
      { status: 409 },
    );
  }

  const processed = await processProofPhoto(new Uint8Array(await file.arrayBuffer()));
  if (!processed.ok) return NextResponse.json({ error: processed.error }, { status: 415 });

  const result = await prisma.$transaction(async (tx) => {
    // Lock the job so two uploads cannot both pass the per-stage limit and the
    // status cannot move on while the photo is being saved.
    await tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "Job" WHERE "id" = ${jobId} FOR UPDATE`;
    const current = await tx.job.findUnique({ where: { id: jobId }, select: { status: true, acceptedById: true } });
    if (!current || current.acceptedById !== accountId || current.status !== requiredStatus) {
      return { error: "This job has moved on, so the photo was not saved.", status: 409 } as const;
    }
    const existing = await tx.jobProofPhoto.count({ where: { jobId, stage } });
    if (existing >= MAX_PROOF_PHOTOS_PER_STAGE) {
      return { error: `At most ${MAX_PROOF_PHOTOS_PER_STAGE} photos can be added at each stage.`, status: 409 } as const;
    }
    const photo = await tx.jobProofPhoto.create({
      data: {
        jobId,
        uploadedById: accountId,
        stage,
        mimeType: processed.mimeType,
        sizeBytes: processed.sizeBytes,
        width: processed.width,
        height: processed.height,
        sha256: processed.sha256,
        content: processed.content,
        expiresAt: proofExpiry(),
      },
      select: PHOTO_SELECT,
    });
    return { photo } as const;
  });

  if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });
  purgeProofPhotosSometimes(prisma as any);
  return NextResponse.json({ success: true, photo: result.photo }, { status: 201 });
}

// Poster, driver or administrator: list the photos on a job (no image bytes).
async function GETHandler(_req: Request, { params }: RouteContext) {
  const { id: jobId } = await params;
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Not logged in." }, { status: 401 });
  const accountId = (session.user as any)?.accountId;
  if (!accountId) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  const admin = await isTesterAdmin();
  if (!admin) {
    const marketAccessError = await requireJobMarketAccess(accountId, jobId);
    if (marketAccessError) return marketAccessError;
  }
  const job = await prisma.job.findUnique({ where: { id: jobId }, select: { posterId: true, acceptedById: true } });
  if (!job) return NextResponse.json({ error: "Job not found." }, { status: 404 });
  if (!admin && job.posterId !== accountId && job.acceptedById !== accountId) {
    return NextResponse.json({ error: "You're not involved in this job." }, { status: 403 });
  }

  const photos = await prisma.jobProofPhoto.findMany({
    where: { jobId, OR: [{ expiresAt: { gt: new Date() } }, { job: { status: "disputed" } }] },
    orderBy: { createdAt: "asc" },
    select: PHOTO_SELECT,
    take: 20,
  });
  return NextResponse.json({ photos }, { headers: { "Cache-Control": "private, no-store" } });
}

export const POST = withApiMetrics("/api/jobs/[id]/proof", POSTHandler);
export const GET = withApiMetrics("/api/jobs/[id]/proof", GETHandler);
