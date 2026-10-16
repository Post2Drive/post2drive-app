import { withApiMetrics } from "@/lib/apiMetrics";
import { requireJobMarketAccess } from "@/lib/jobMarket";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isTesterAdmin } from "@/lib/testerAdmin";

type RouteContext = { params: Promise<{ id: string; incidentId: string; evidenceId: string }> };

async function GETHandler(_req: Request, { params }: RouteContext) {
  const { id: jobId, incidentId, evidenceId } = await params;
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Not logged in." }, { status: 401 });
  const accountId = (session.user as any)?.accountId;
  if (!accountId) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }
  const admin = await isTesterAdmin();
  if (!admin) {
    const marketAccessError = await requireJobMarketAccess(accountId, jobId);
    if (marketAccessError) return marketAccessError;
  }

  const evidence = await prisma.incidentEvidence.findFirst({
    where: { id: evidenceId, jobId, incidentId },
    select: {
      content: true,
      fileName: true,
      mimeType: true,
      sha256: true,
      job: { select: { posterId: true, acceptedById: true } },
    },
  });
  if (!evidence) return NextResponse.json({ error: "Evidence file not found." }, { status: 404 });

  const isParty = evidence.job.posterId === accountId || evidence.job.acceptedById === accountId;
  if (!isParty && !admin) {
    return NextResponse.json({ error: "You are not authorised to access this evidence." }, { status: 403 });
  }

  const safeName = evidence.fileName.replace(/["\\\r\n]/g, "_");
  return new Response(new Uint8Array(evidence.content), {
    status: 200,
    headers: {
      "Content-Type": evidence.mimeType,
      "Content-Disposition": `attachment; filename="${safeName}"`,
      "Content-Length": String(evidence.content.byteLength),
      "X-Content-Type-Options": "nosniff",
      "Cache-Control": "private, no-store",
      "ETag": `"${evidence.sha256}"`,
    },
  });
}

export const GET = withApiMetrics("/api/jobs/[id]/incidents/[incidentId]/evidence/[evidenceId]", GETHandler);
