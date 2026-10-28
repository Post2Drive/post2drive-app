import { withApiMetrics } from "@/lib/apiMetrics";
import { requireJobMarketAccess } from "@/lib/jobMarket";
import { NextResponse } from "next/server";
import { readBoundedJson } from "@/lib/requestBody";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

type RouteContext = { params: Promise<{ id: string }> };
const MAX_DESCRIPTION_LENGTH = 4000;
const MAX_EVIDENCE_ITEMS = 10;
const MAX_EVIDENCE_REFERENCE_LENGTH = 1000;

async function POSTHandler(req: Request, { params }: RouteContext) {
  const { id: jobId } = await params;
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Not logged in." }, { status: 401 });
  const accountId = (session.user as any)?.accountId;
  if (!accountId) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }
  const marketAccessError = await requireJobMarketAccess(accountId, jobId);
  if (marketAccessError) return marketAccessError;

  const job = await prisma.job.findUnique({ where: { id: jobId } });
  if (!job) return NextResponse.json({ error: "Job not found." }, { status: 404 });
  if (job.posterId !== accountId && job.acceptedById !== accountId) {
    return NextResponse.json({ error: "Only the poster or accepted driver can add incident updates." }, { status: 403 });
  }

  const parsedBody = await readBoundedJson(req, 64 * 1024);
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

  const incidentId = typeof body?.incidentId === "string" ? body.incidentId : "";
  const description = typeof body?.description === "string" ? body.description.trim() : "";
  const evidence = body?.evidence === undefined ? [] : body.evidence;
  if (!incidentId) return NextResponse.json({ error: "incidentId is required." }, { status: 400 });
  if (description.length > MAX_DESCRIPTION_LENGTH) {
    return NextResponse.json({ error: `Description must be at most ${MAX_DESCRIPTION_LENGTH} characters.` }, { status: 400 });
  }
  if (!description && (!Array.isArray(evidence) || evidence.length === 0)) {
    return NextResponse.json({ error: "Provide an update or new evidence references." }, { status: 400 });
  }
  if (!Array.isArray(evidence) || evidence.length > MAX_EVIDENCE_ITEMS ||
      evidence.some((item) => typeof item !== "string" || item.length > MAX_EVIDENCE_REFERENCE_LENGTH ||
        !/^https:\/\//i.test(item) || /[\r\n]/.test(item))) {
    return NextResponse.json({ error: `Evidence must be up to ${MAX_EVIDENCE_ITEMS} HTTPS references, each no longer than ${MAX_EVIDENCE_REFERENCE_LENGTH} characters.` }, { status: 400 });
  }

  const original = await prisma.jobActivity.findFirst({
    where: { id: incidentId, jobId, action: "INCIDENT_REPORTED" },
    select: { id: true, createdAt: true },
  });
  if (!original) return NextResponse.json({ error: "Incident report not found for this job." }, { status: 404 });

  const targetAccountId = job.posterId === accountId ? job.acceptedById : job.posterId;
  const event = await prisma.$transaction(async (tx) => {
    const created = await tx.jobActivity.create({
      data: {
        jobId,
        actorId: accountId,
        action: "INCIDENT_UPDATE_ADDED",
        fromStatus: job.status,
        toStatus: job.status,
        description: description || "Additional incident evidence provided.",
        metadata: {
          schemaVersion: 1,
          parentIncidentId: incidentId,
          evidence,
          addedAt: new Date().toISOString(),
          lifecycleStatusAtUpdate: job.status,
        },
      },
    });

    if (targetAccountId && targetAccountId !== accountId) {
      await tx.notification.create({
        data: {
          accountId: targetAccountId,
          type: "job_incident_update",
          title: "New update on a job incident",
          body: `A new update was added to the incident for job ${jobId}.`,
          jobId,
          eventKey: `incident-update:${created.id}:${targetAccountId}`,
          metadata: { incidentId, updateId: created.id },
        },
      });
    }
    return created;
  });

  return NextResponse.json({ success: true, update: event }, { status: 201 });
}

export const POST = withApiMetrics("/api/jobs/[id]/incidents/updates", POSTHandler);
