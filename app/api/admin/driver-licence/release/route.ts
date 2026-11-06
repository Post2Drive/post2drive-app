import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { isTesterAdmin } from "@/lib/testerAdmin";
import { prisma } from "@/lib/prisma";
import { readBoundedJson } from "@/lib/requestBody";
import { enforceRateLimit } from "@/lib/rateLimit";
import { withApiMetrics } from "@/lib/apiMetrics";
import { hashLicenceNumber, licenceHashSecret } from "@/lib/driverLicence";
import { normaliseLicenceNumber } from "@/lib/vehicleApproval";

/*
 * Admin-only release of a disputed driving licence (EXECUTION_PLAN §6). Support verifies
 * the claimant outside the app, then frees the licence so the rightful person can record
 * it. The admin supplies the licence number (hashed here, never stored or logged); the
 * DriverIdentity row holding it is removed, the holder is notified, and the action is
 * audited with the holder's account id and the reason. Nothing identifying is returned.
 */
async function POSTHandler(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Not logged in." }, { status: 401 });
  if (!(await isTesterAdmin())) return NextResponse.json({ error: "Administrator access required." }, { status: 403 });
  const reviewer = session.user?.email?.trim().toLowerCase() || "admin";

  const limited = await enforceRateLimit(req, { scope: "admin-driver-licence-release", identity: reviewer, limit: 30, windowMs: 60 * 60 * 1000 });
  if (limited) return limited;

  const parsed = await readBoundedJson(req, 4 * 1024);
  if (!parsed.ok) return NextResponse.json({ error: parsed.status === 413 ? "Request body is too large." : "Invalid request body." }, { status: parsed.status });
  const body = parsed.value && typeof parsed.value === "object" && !Array.isArray(parsed.value) ? (parsed.value as Record<string, unknown>) : {};
  const normalised = normaliseLicenceNumber(body.licenceNumber);
  const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 1000) : "";
  if (!normalised || reason.length < 10) {
    return NextResponse.json({ error: "Provide the licence number and a reason (at least 10 characters)." }, { status: 400 });
  }
  const secret = licenceHashSecret();
  if (!secret) return NextResponse.json({ error: "Driver licence records are unavailable: hashing secret not configured." }, { status: 503 });
  const licenceHash = hashLicenceNumber(normalised, secret);

  const released = await prisma.$transaction(async (tx) => {
    const identity = await tx.driverIdentity.findUnique({ where: { licenceHash }, select: { id: true, accountId: true, licenceLast4: true } });
    if (!identity) return null;
    await tx.driverIdentity.delete({ where: { id: identity.id } });
    await tx.adminAuditEvent.create({
      data: {
        actor: reviewer, action: "DRIVER_LICENCE_RELEASED", entityType: "Account", entityId: identity.accountId,
        details: { licenceLast4: identity.licenceLast4, reason },
      },
    });
    await tx.notification.create({
      data: {
        accountId: identity.accountId, type: "driver_licence_released", title: "Driving licence removed",
        body: `Support removed the driving licence ending ${identity.licenceLast4} from your account after a review. Contact support if you think this is wrong.`,
        eventKey: `driver-licence-released:${identity.id}`,
      },
    });
    return identity;
  });

  if (!released) return NextResponse.json({ error: "No account holds this licence." }, { status: 404 });
  return NextResponse.json({ success: true, licenceLast4: released.licenceLast4 });
}

export const POST = withApiMetrics("/api/admin/driver-licence/release", POSTHandler);
