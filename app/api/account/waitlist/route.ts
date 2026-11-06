import { withApiMetrics } from "@/lib/apiMetrics";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getDriveAccess } from "@/lib/access";

export const dynamic = "force-dynamic";

/**
 * Driver waitlist status (EXECUTION_PLAN §4). Evaluating DRIVE access joins the regional queue
 * and admits the account automatically when room appears, so polling this needs no cron.
 */
async function GETHandler() {
  const session = await getServerSession(authOptions);
  const accountId = session?.user?.accountId;
  if (!accountId) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }

  const drive = await getDriveAccess(accountId);
  if (!drive.account) {
    return NextResponse.json({ error: "Account not found." }, { status: 404 });
  }

  return NextResponse.json({
    driveAllowed: drive.allowed,
    reason: drive.reason,
    operatingRegion: drive.account.operatingRegion,
    waitlisted: drive.reason === "waitlisted",
    waitlistPosition: drive.waitlistPosition,
    admittedAt: drive.account.driverAdmittedAt,
    freeDrivingUntil: drive.allowed && drive.reason === "driver_window" ? drive.endsAt ?? null : null,
    opensAt: drive.opensAt,
  }, { headers: { "Cache-Control": "no-store" } });
}

export const GET = withApiMetrics("/api/account/waitlist", GETHandler);
