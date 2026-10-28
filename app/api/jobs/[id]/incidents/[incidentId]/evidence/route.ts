import { createHash } from "node:crypto";
import { withApiMetrics } from "@/lib/apiMetrics";
import { requireJobMarketAccess } from "@/lib/jobMarket";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { enforceRateLimit } from "@/lib/rateLimit";
import { readBoundedBytes } from "@/lib/requestBody";

type RouteContext = { params: Promise<{ id: string; incidentId: string }> };
const MAX_FILE_BYTES = 5 * 1024 * 1024;
const MAX_FILES_PER_INCIDENT = 10;
const MAX_TOTAL_BYTES_PER_INCIDENT = 25 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set(["image/jpeg", "image/png", "image/webp", "application/pdf"]);

function validSignature(mimeType: string, bytes: Buffer) {
  if (mimeType === "image/jpeg") return bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
  if (mimeType === "image/png") return bytes.length >= 8 && bytes.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]));
  if (mimeType === "image/webp") return bytes.length >= 12 && bytes.toString("ascii", 0, 4) === "RIFF" && bytes.toString("ascii", 8, 12) === "WEBP";
  if (mimeType === "application/pdf") return bytes.length >= 5 && bytes.toString("ascii", 0, 5) === "%PDF-";
  return false;
}

async function POSTHandler(req: Request, { params }: RouteContext) {
  const contentLength = Number(req.headers.get("content-length") || 0);
  if (Number.isFinite(contentLength) && contentLength > MAX_FILE_BYTES + 256 * 1024) {
    return NextResponse.json({ error: "Upload request exceeds the 5 MB file limit." }, { status: 413 });
  }
  const { id: jobId, incidentId } = await params;
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Not logged in." }, { status: 401 });
  const accountId = (session.user as any)?.accountId;
  if (!accountId) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }
  const marketAccessError = await requireJobMarketAccess(accountId, jobId);
  if (marketAccessError) return marketAccessError;

  const job = await prisma.job.findUnique({ where: { id: jobId }, select: { id: true, posterId: true, acceptedById: true } });
  if (!job) return NextResponse.json({ error: "Job not found." }, { status: 404 });
  if (job.posterId !== accountId && job.acceptedById !== accountId) {
    return NextResponse.json({ error: "Only the poster or accepted driver can upload evidence for this job." }, { status: 403 });
  }

  const uploadLimit = await enforceRateLimit(req, {
    scope: "incident-evidence-upload",
    identity: accountId,
    limit: 20,
    windowMs: 60 * 60 * 1000,
  });
  if (uploadLimit) return uploadLimit;

  const incident = await prisma.jobActivity.findFirst({
    where: { id: incidentId, jobId, action: "INCIDENT_REPORTED" },
    select: { id: true },
  });
  if (!incident) return NextResponse.json({ error: "Incident report not found for this job." }, { status: 404 });

  const boundedBody = await readBoundedBytes(req, MAX_FILE_BYTES + 256 * 1024);
  if (!boundedBody.ok) {
    return NextResponse.json(
      { error: boundedBody.status === 413 ? "Upload request exceeds the 5 MB file limit." : "Upload body is invalid." },
      { status: boundedBody.status },
    );
  }
  const boundedBodyBuffer = new ArrayBuffer(boundedBody.bytes.byteLength);
  new Uint8Array(boundedBodyBuffer).set(boundedBody.bytes);
  const boundedHeaders = new Headers(req.headers);
  boundedHeaders.delete("content-length");
  let form: FormData;
  try {
    const boundedRequest = new Request(req.url, {
      method: "POST",
      headers: boundedHeaders,
      body: boundedBodyBuffer,
    });
    form = await boundedRequest.formData();
  } catch {
    return NextResponse.json({ error: "Upload must use multipart form data." }, { status: 400 });
  }
  const file = form.get("file");
  if (!(file instanceof File)) return NextResponse.json({ error: "Choose a file to upload." }, { status: 400 });
  if (file.size <= 0 || file.size > MAX_FILE_BYTES) {
    return NextResponse.json({ error: "Evidence files must be between 1 byte and 5 MB." }, { status: 413 });
  }
  const mimeType = file.type.toLowerCase();
  if (!ALLOWED_MIME_TYPES.has(mimeType)) {
    return NextResponse.json({ error: "Supported evidence formats are JPEG, PNG, WebP and PDF." }, { status: 415 });
  }

  const bytes = Buffer.from(await file.arrayBuffer());
  if (!validSignature(mimeType, bytes)) {
    return NextResponse.json({ error: "The file content does not match its declared format." }, { status: 415 });
  }
  const fileName = file.name.replace(/[^a-zA-Z0-9._() -]/g, "_").replace(/\.{2,}/g, ".").slice(0, 180) || "evidence";
  const sha256 = createHash("sha256").update(bytes).digest("hex");

  const result = await prisma.$transaction(async (tx) => {
    await tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "JobActivity" WHERE "id" = ${incidentId} FOR UPDATE`;
    const totals = await tx.incidentEvidence.aggregate({
      where: { incidentId },
      _count: { _all: true },
      _sum: { sizeBytes: true },
    });
    if (totals._count._all >= MAX_FILES_PER_INCIDENT) return { error: "An incident can have at most 10 evidence files." } as const;
    if ((totals._sum.sizeBytes || 0) + bytes.byteLength > MAX_TOTAL_BYTES_PER_INCIDENT) {
      return { error: "Evidence storage for this incident is limited to 25 MB in total." } as const;
    }
    const evidence = await tx.incidentEvidence.create({
      data: {
        incidentId,
        jobId,
        uploadedById: accountId,
        fileName,
        mimeType,
        sizeBytes: bytes.byteLength,
        sha256,
        content: bytes,
      },
      select: { id: true, incidentId: true, jobId: true, fileName: true, mimeType: true, sizeBytes: true, sha256: true, createdAt: true },
    });
    return { evidence } as const;
  });

  if ("error" in result) return NextResponse.json({ error: result.error }, { status: 413 });
  return NextResponse.json({ success: true, evidence: result.evidence }, { status: 201 });
}

export const POST = withApiMetrics("/api/jobs/[id]/incidents/[incidentId]/evidence", POSTHandler);
