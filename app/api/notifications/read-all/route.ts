import { withApiMetrics } from "@/lib/apiMetrics";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { enforceRateLimit } from "@/lib/rateLimit";

async function POSTHandler(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Not logged in." }, { status: 401 });
  const accountId = (session.user as any)?.accountId;
  if (!accountId) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  // Light rate-limit: marking all read is a write but low-risk; 60/hour is generous.
  const limited = await enforceRateLimit(req, {
    scope: "notifications-read-all",
    identity: accountId,
    limit: 60,
    windowMs: 60 * 60 * 1000,
  });
  if (limited) return limited;

  const result = await prisma.notification.updateMany({
    where: { accountId, readAt: null },
    data: { readAt: new Date() },
  });

  return NextResponse.json({ success: true, marked: result.count });
}

export const POST = withApiMetrics("/api/notifications/read-all", POSTHandler);
