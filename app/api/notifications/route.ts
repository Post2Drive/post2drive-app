import { withApiMetrics } from "@/lib/apiMetrics";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

async function GETHandler(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Not logged in." }, { status: 401 });
  const accountId = (session.user as any)?.accountId;
  if (!accountId) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  const url = new URL(req.url);
  const limitRaw = Number(url.searchParams.get("limit") || 30);
  const limit = Number.isFinite(limitRaw) ? Math.min(100, Math.max(1, Math.floor(limitRaw))) : 30;
  const notifications = await prisma.notification.findMany({
    where: { accountId },
    orderBy: { createdAt: "desc" },
    take: limit,
    select: { id: true, type: true, title: true, body: true, jobId: true, metadata: true, readAt: true, createdAt: true },
  });
  const unreadCount = await prisma.notification.count({ where: { accountId, readAt: null } });
  return NextResponse.json({ notifications, unreadCount });
}

export const GET = withApiMetrics("/api/notifications", GETHandler);
