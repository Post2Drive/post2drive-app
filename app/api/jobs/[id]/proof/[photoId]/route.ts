import { withApiMetrics } from "@/lib/apiMetrics";
import { requireJobMarketAccess } from "@/lib/jobMarket";
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

export const GET = withApiMetrics("/api/jobs/[id]/proof/[photoId]", GETHandler);
