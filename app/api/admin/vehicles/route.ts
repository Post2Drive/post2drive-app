import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { isTesterAdmin } from "@/lib/testerAdmin";
import { prisma } from "@/lib/prisma";
import { readBoundedJson } from "@/lib/requestBody";
import { enforceRateLimit } from "@/lib/rateLimit";
import { withApiMetrics } from "@/lib/apiMetrics";
import { insurancePolicyKey, vehicleApprovalProblems, vehicleCorrectionDeadline } from "@/lib/vehicleApproval";

/*
 * Admin vehicle review (EXECUTION_PLAN §6). Without this no vehicle can become
 * verified, so no real driver can accept jobs. Approval re-checks every rule
 * server-side; the admin UI only displays the same result.
 */

const vehicleReviewSelect = {
  id: true, vehicleType: true, regPlate: true, registrationRegion: true, ownershipType: true,
  make: true, model: true, mamKg: true, operatorLicenceNo: true,
  v5cDocumentUrl: true, insuranceDocumentUrl: true, leaseAgreementUrl: true,
  motValidUntil: true, insuranceValidUntil: true,
  registeredKeeperType: true, registeredKeeperName: true,
  insurancePolicyholderName: true, insuranceCoverType: true, insurancePolicyNumber: true,
  verificationStatus: true, rejectionReason: true, rejectionCount: true, correctionDeadline: true, createdAt: true,
  account: {
    select: {
      id: true, displayId: true, companyName: true, planType: true, fleetVehicleCount: true, country: true, currency: true,
      driverIdentity: { select: { licenceLast4: true } },
      _count: { select: { vehicles: true } },
      insurancePolicyReviews: { select: { policyKey: true, reviewedAt: true } },
    },
  },
} as const;

async function GETHandler() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Not logged in." }, { status: 401 });
  if (!(await isTesterAdmin())) return NextResponse.json({ error: "Administrator access required." }, { status: 403 });

  const rows = await prisma.vehicle.findMany({
    where: { verificationStatus: { in: ["pending", "manual_review"] }, account: { deletionRequestedAt: null } },
    select: vehicleReviewSelect,
    orderBy: { createdAt: "asc" },
    take: 200,
  });
  const vehicles = rows.map(({ account, ...vehicle }) => {
    const policyKey = insurancePolicyKey(vehicle.insurancePolicyholderName, vehicle.insurancePolicyNumber);
    return {
      ...vehicle,
      account: {
        id: account.id, displayId: account.displayId, companyName: account.companyName,
        planType: account.planType, fleetVehicleCount: account.fleetVehicleCount,
        country: account.country, currency: account.currency,
        vehicleCount: account._count.vehicles,
        driverLicenceLast4: account.driverIdentity?.licenceLast4 ?? null,
      },
      insurancePolicyReviewedAt: account.insurancePolicyReviews.find((review) => review.policyKey === policyKey)?.reviewedAt ?? null,
      approvalProblems: vehicleApprovalProblems(
        vehicle,
        { companyName: account.companyName, planType: account.planType, fleetVehicleCount: account.fleetVehicleCount, hasDriverIdentity: Boolean(account.driverIdentity) },
        account._count.vehicles,
      ),
    };
  });
  return NextResponse.json({ vehicles }, { headers: { "Cache-Control": "private, no-store" } });
}

async function POSTHandler(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Not logged in." }, { status: 401 });
  if (!(await isTesterAdmin())) return NextResponse.json({ error: "Administrator access required." }, { status: 403 });
  const reviewer = session.user?.email?.trim().toLowerCase() || "admin";

  const limited = await enforceRateLimit(req, { scope: "admin-vehicle-review", identity: reviewer, limit: 300, windowMs: 60 * 60 * 1000 });
  if (limited) return limited;

  const parsed = await readBoundedJson(req, 8 * 1024);
  if (!parsed.ok) return NextResponse.json({ error: parsed.status === 413 ? "Request body is too large." : "Invalid request body." }, { status: parsed.status });
  if (!parsed.value || typeof parsed.value !== "object" || Array.isArray(parsed.value)) {
    return NextResponse.json({ error: "Provide a vehicle ID and review decision." }, { status: 400 });
  }
  const body = parsed.value as Record<string, unknown>;
  const vehicleId = typeof body.vehicleId === "string" ? body.vehicleId.trim() : "";
  const decision = body.decision;
  const reason = typeof body.reason === "string" ? body.reason.trim().slice(0, 1000) : "";
  if (!vehicleId || vehicleId.length > 40 || (decision !== "approve" && decision !== "reject")) {
    return NextResponse.json({ error: "Invalid vehicle ID or decision." }, { status: 400 });
  }
  if (decision === "reject" && reason.length < 5) {
    return NextResponse.json({ error: "Give the owner a rejection reason (at least 5 characters)." }, { status: 400 });
  }

  const outcome = await prisma.$transaction(async (tx) => {
    // Serialize concurrent reviews of the same vehicle.
    const locked = await tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "Vehicle" WHERE "id" = ${vehicleId} FOR UPDATE`;
    if (locked.length !== 1) return { status: 404, error: "Vehicle not found." } as const;
    const vehicle = await tx.vehicle.findUnique({ where: { id: vehicleId }, select: vehicleReviewSelect });
    if (!vehicle) return { status: 404, error: "Vehicle not found." } as const;
    if (!["pending", "manual_review"].includes(vehicle.verificationStatus)) {
      return { status: 409, error: "Only vehicles awaiting review can be reviewed." } as const;
    }
    const { account } = vehicle;
    const now = new Date();

    if (decision === "approve") {
      const problems = vehicleApprovalProblems(
        vehicle,
        { companyName: account.companyName, planType: account.planType, fleetVehicleCount: account.fleetVehicleCount, hasDriverIdentity: Boolean(account.driverIdentity) },
        account._count.vehicles,
        now,
      );
      if (problems.length > 0) return { status: 422, error: "This vehicle does not meet the approval rules.", problems } as const;

      const updated = await tx.vehicle.update({
        where: { id: vehicleId },
        data: { verificationStatus: "verified", verifiedAt: now, reviewedAt: now, rejectionReason: null, correctionDeadline: null },
        select: { id: true, regPlate: true, verificationStatus: true, verifiedAt: true },
      });
      // Insurance is reviewed once per policy: later vehicles on the same
      // policyholder + policy number show it as already reviewed.
      const policyKey = insurancePolicyKey(vehicle.insurancePolicyholderName, vehicle.insurancePolicyNumber);
      if (policyKey) {
        await tx.insurancePolicyReview.upsert({
          where: { accountId_policyKey: { accountId: account.id, policyKey } },
          create: {
            accountId: account.id, policyKey, reviewedBy: reviewer,
            policyholderName: vehicle.insurancePolicyholderName ?? "", policyNumber: vehicle.insurancePolicyNumber ?? "",
            coverType: vehicle.insuranceCoverType ?? "",
          },
          update: {},
        });
      }
      await tx.adminAuditEvent.create({
        data: {
          actor: reviewer, action: "VEHICLE_APPROVED", entityType: "Vehicle", entityId: vehicleId, market: account.country,
          details: { accountId: account.id, coverType: vehicle.insuranceCoverType, policyReviewRecorded: Boolean(policyKey) },
        },
      });
      await tx.notification.create({
        data: {
          accountId: account.id, type: "vehicle_approved", title: "Vehicle approved",
          body: `Your vehicle ${vehicle.regPlate} was approved. It can now be used for matching jobs while its insurance and any required inspection stay current.`,
          eventKey: `vehicle-approved:${vehicleId}:${now.getTime()}`,
          metadata: { vehicleId },
        },
      });
      return { status: 200, vehicle: updated } as const;
    }

    const rejectionCount = vehicle.rejectionCount + 1;
    const correctionDeadline = vehicleCorrectionDeadline(rejectionCount, now);
    const updated = await tx.vehicle.update({
      where: { id: vehicleId },
      data: { verificationStatus: "failed", verifiedAt: null, reviewedAt: now, rejectionReason: reason, rejectionCount, correctionDeadline },
      select: { id: true, regPlate: true, verificationStatus: true, correctionDeadline: true },
    });
    await tx.adminAuditEvent.create({
      data: {
        actor: reviewer, action: "VEHICLE_REJECTED", entityType: "Vehicle", entityId: vehicleId, market: account.country,
        details: { accountId: account.id, reason, rejectionCount, correctionDeadline: correctionDeadline?.toISOString() ?? null },
      },
    });
    await tx.notification.create({
      data: {
        accountId: account.id, type: "vehicle_rejected", title: "Vehicle not approved",
        body: correctionDeadline
          ? `Your vehicle ${vehicle.regPlate} was not approved: ${reason} Correct it free of charge by ${correctionDeadline.toISOString().slice(0, 10)}.`
          : `Your vehicle ${vehicle.regPlate} was not approved: ${reason} The free correction windows have been used; a new check is needed.`,
        eventKey: `vehicle-rejected:${vehicleId}:${rejectionCount}`,
        metadata: { vehicleId, rejectionCount },
      },
    });
    return { status: 200, vehicle: updated } as const;
  });

  if (outcome.status !== 200) {
    return NextResponse.json({ error: outcome.error, ...("problems" in outcome ? { problems: outcome.problems } : {}) }, { status: outcome.status });
  }
  return NextResponse.json({ success: true, vehicle: outcome.vehicle });
}

export const GET = withApiMetrics("/api/admin/vehicles", GETHandler);
export const POST = withApiMetrics("/api/admin/vehicles", POSTHandler);
