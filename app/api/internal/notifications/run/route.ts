import { createHash, timingSafeEqual } from "node:crypto";
import { NextResponse } from "next/server";
import { withApiMetrics } from "@/lib/apiMetrics";
import { prisma } from "@/lib/prisma";
import { enforceRateLimit } from "@/lib/rateLimit";
import { runScheduledNotifications } from "@/lib/scheduledNotifications";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function secretMatches(supplied: string, expected: string) {
  // Hash both sides so the comparison is constant-time regardless of length.
  const a = createHash("sha256").update(supplied).digest();
  const b = createHash("sha256").update(expected).digest();
  return timingSafeEqual(a, b);
}

// POST /api/internal/notifications/run — called by a scheduler (for example a
// Railway cron) once a day. Not a user route: requires the shared secret in the
// x-scheduler-secret header and fails closed when POST2DRIVE_SCHEDULER_SECRET is unset.
async function POSTHandler(req: Request) {
  const expected = process.env.POST2DRIVE_SCHEDULER_SECRET;
  if (!expected) {
    return NextResponse.json({ error: "Scheduler is not configured." }, { status: 503, headers: { "Cache-Control": "no-store" } });
  }
  const limited = await enforceRateLimit(req, { scope: "internal-notifications-run", limit: 30, windowMs: 60 * 60 * 1000 });
  if (limited) return limited;

  const supplied = req.headers.get("x-scheduler-secret") ?? "";
  if (!supplied || !secretMatches(supplied, expected)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401, headers: { "Cache-Control": "no-store" } });
  }

  try {
    const summary = await runScheduledNotifications(prisma, new Date());
    return NextResponse.json({ success: true, ...summary }, { headers: { "Cache-Control": "no-store" } });
  } catch (error) {
    console.error("Scheduled notifications failed.", { errorName: error instanceof Error ? error.name : "UnknownError" });
    return NextResponse.json({ error: "Scheduled notifications failed." }, { status: 500, headers: { "Cache-Control": "no-store" } });
  }
}

export const POST = withApiMetrics("/api/internal/notifications/run", POSTHandler);
