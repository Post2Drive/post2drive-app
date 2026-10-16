import { withApiMetrics } from "@/lib/apiMetrics";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

async function POSTHandler(
  _req: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Not logged in." }, { status: 401 });
  const accountId = (session.user as any)?.accountId;
  if (!accountId) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  const result = await prisma.notification.updateMany({
    where: { id, accountId, readAt: null },
    data: { readAt: new Date() },
  });
  if (result.count === 0) {
    const existing = await prisma.notification.findFirst({
      where: { id, accountId },
      select: { id: true, readAt: true },
    });
    if (!existing) return NextResponse.json({ error: "Notification not found." }, { status: 404 });
    return NextResponse.json({ success: true, alreadyRead: true });
  }
  return NextResponse.json({ success: true, alreadyRead: false });
}

export const POST = withApiMetrics("/api/notifications/[id]/read", POSTHandler);
