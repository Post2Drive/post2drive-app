import { withApiMetrics } from "@/lib/apiMetrics";
import { requireJobMarketAccess } from "@/lib/jobMarket";
import { NextResponse } from "next/server";
import { readBoundedJson } from "@/lib/requestBody";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

const INCIDENT_REASONS = new Set([
  "vehicle_breakdown",
  "health_emergency",
  "wrong_load",
  "unsafe_load",
  "accident",
  "delay",
  "pickup_problem",
  "delivery_damage",
  "contact_issue",
  "payment_dispute",
  "other",
]);

const MAX_DESCRIPTION_LENGTH = 4000;
const MAX_EVIDENCE_ITEMS = 10;
const MAX_EVIDENCE_REFERENCE_LENGTH = 1000;

type RouteContext = { params: Promise<{ id: string }> };

type JobAccess =
  | { ok: true; job: NonNullable<Awaited<ReturnType<typeof prisma.job.findUnique>>> }
  | { ok: false; response: NextResponse };

async function getInvolvedJob(jobId: string, accountId: string): Promise<JobAccess> {
  const job = await prisma.job.findUnique({ where: { id: jobId } });
  if (!job) {
    return { ok: false, response: NextResponse.json({ error: "Job not found." }, { status: 404 }) };
  }
  if (job.posterId !== accountId && job.acceptedById !== accountId) {
    return { ok: false, response: NextResponse.json({ error: "Only the poster or accepted driver can access this job's incidents." }, { status: 403 }) };
  }
  return { ok: true, job };
}

// GET /api/jobs/[id]/incidents — append-only incident history for the parties.
async function GETHandler(_req: Request, { params }: RouteContext) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Not logged in." }, { status: 401 });
  const accountId = (session.user as any)?.accountId;
  if (!accountId) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }
  const marketAccessError = await requireJobMarketAccess(accountId, id);
  if (marketAccessError) return marketAccessError;

  const access = await getInvolvedJob(id, accountId);
  if (!access.ok) return access.response;

  const events = await prisma.jobActivity.findMany({
    where: {
      jobId: id,
      action: { in: ["INCIDENT_REPORTED", "INCIDENT_UPDATE_ADDED", "INCIDENT_RESOLUTION_RECORDED"] },
    },
    orderBy: { createdAt: "asc" },
    include: {
      evidenceFiles: {
        orderBy: { createdAt: "asc" },
        select: { id: true, fileName: true, mimeType: true, sizeBytes: true, sha256: true, createdAt: true },
      },
    },
  });
  return NextResponse.json({ incidents: events });
}

// POST /api/jobs/[id]/incidents — report an incident without erasing or
// silently reversing the underlying job lifecycle.
async function POSTHandler(req: Request, { params }: RouteContext) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Not logged in." }, { status: 401 });
  const accountId = (session.user as any)?.accountId;
  if (!accountId) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }
  const marketAccessError = await requireJobMarketAccess(accountId, id);
  if (marketAccessError) return marketAccessError;

  const access = await getInvolvedJob(id, accountId);
  if ("response" in access) return access.response;
  const job = access.job;

  if (job.status === "open") {
    return NextResponse.json(
      { error: "An incident requires an accepted or previously accepted job. Use ordinary cancellation for an open job." },
      { status: 409 }
    );
  }

  const parsedBody = await readBoundedJson(req, 16 * 1024);
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

  const reason = typeof body?.reason === "string" ? body.reason : "";
  const description = typeof body?.description === "string" ? body.description.trim() : "";
  const requestedOutcome = typeof body?.requestedOutcome === "string" ? body.requestedOutcome.trim() : "";
  const location = typeof body?.location === "string" ? body.location.trim() : "";
  const evidenceInput = body?.evidence;

  if (!INCIDENT_REASONS.has(reason)) {
    return NextResponse.json({ error: "Choose a supported incident reason." }, { status: 400 });
  }
  if (!description || description.length > MAX_DESCRIPTION_LENGTH) {
    return NextResponse.json({ error: `Description is required and must be at most ${MAX_DESCRIPTION_LENGTH} characters.` }, { status: 400 });
  }
  if (requestedOutcome.length > 500 || location.length > 300) {
    return NextResponse.json({ error: "Requested outcome or location is too long." }, { status: 400 });
  }

  // Evidence references can point to files stored by a future approved upload
  // provider. The app does not claim to upload or preserve files itself yet.
  const evidence = evidenceInput === undefined ? [] : evidenceInput;
  if (!Array.isArray(evidence) || evidence.length > MAX_EVIDENCE_ITEMS ||
      evidence.some((item) => typeof item !== "string" || item.length > MAX_EVIDENCE_REFERENCE_LENGTH ||
        !/^https:\/\//i.test(item) || /[\r\n]/.test(item))) {
    return NextResponse.json(
      { error: `Evidence must be up to ${MAX_EVIDENCE_ITEMS} HTTPS references, each no longer than ${MAX_EVIDENCE_REFERENCE_LENGTH} characters. Do not include passwords or private access tokens in links.` },
      { status: 400 }
    );
  }

  const reporterRole = job.posterId === accountId ? "poster" : "driver";
  const targetAccountId = job.posterId === accountId ? job.acceptedById : job.posterId;
  const now = new Date();
  const event = await prisma.$transaction(async (tx) => {
    const created = await tx.jobActivity.create({
      data: {
        jobId: id,
        actorId: accountId,
        action: "INCIDENT_REPORTED",
        fromStatus: job.status,
        toStatus: job.status,
        description: `Incident reported: ${reason.replaceAll("_", " ")}.`,
        metadata: {
          schemaVersion: 1,
          reason,
          description,
          requestedOutcome: requestedOutcome || null,
          location: location || null,
          evidence,
          reporterRole,
          reportedAt: now.toISOString(),
          lifecycleStatusAtReport: job.status,
          workflowStatus: "open",
          note: "This is an append-only report. Job status is intentionally preserved; authorised support resolution is a separate workflow.",
        },
      },
    });

    if (targetAccountId && targetAccountId !== accountId) {
      await tx.notification.create({
        data: {
          accountId: targetAccountId,
          type: "job_incident",
          title: "New incident reported on a job",
          body: `An incident was reported for job ${id}. Open the job incident history to review the details.`,
          jobId: id,
          eventKey: `incident:${created.id}:reported:${targetAccountId}`,
          metadata: { incidentId: created.id, reason, reporterRole },
        },
      });
    }
    return created;
  });

  return NextResponse.json({ success: true, incident: event }, { status: 201 });
}

export const GET = withApiMetrics("/api/jobs/[id]/incidents", GETHandler);
export const POST = withApiMetrics("/api/jobs/[id]/incidents", POSTHandler);
