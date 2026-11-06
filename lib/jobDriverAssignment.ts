/*
 * Per-job driver record (EXECUTION_PLAN §6). Every job a FLEET accepts or wins records
 * the driver name, licence (keyed hash + last 4) and the vehicle used; individual drivers
 * get their own name, recorded licence and approved vehicle. The poster sees name,
 * licence last 4 and registration only after acceptance (see driverRecordView).
 */
import { hashLicenceNumber, licenceHashSecret, licenceLast4 } from "@/lib/driverLicence";
import { vehicleEligibilityWhere, type VehicleMarket } from "@/lib/eligibility";
import { isFleetAccount, parseFleetDriverInput, vehicleCorrectionDeadline, vehiclesFailingFleetRevalidation } from "@/lib/vehicleApproval";

export type DriverDeclaration =
  | { fleet: false }
  | { fleet: true; driverName: string; licenceHash: string; licenceLast4: string; vehicleId: string };

export type DeclarationResult = { ok: true; value: DriverDeclaration } | { ok: false; status: number; error: string };

/**
 * One rule for whether a bidder must hold an eligible vehicle (and get a recorded
 * driver/vehicle), shared by bid and bid award so a pilot QA account is treated the
 * same at both steps: real accounts always; testers are exempt, except pilot QA
 * accounts (uk-market-student-qa) outside an enabled staging QA run.
 */
export function bidderRequiresEligibleVehicle(bidder: { isTester: boolean }, isPilotQaAccount: boolean, stagingQaTester: boolean) {
  return !bidder.isTester || (isPilotQaAccount && !stagingQaTester);
}

type FleetStatusDb = { vehicle: { count(args: any): Promise<number> } };

/**
 * Single fleet loader for every route (accept, bid, bid award, vehicles, admin): reads
 * the registered vehicle count so legacy accounts (fleetVehicleCount null) with 2+
 * vehicles are fleets too. Always pass this result to parseDriverDeclaration.
 */
export async function loadFleetStatus(
  db: FleetStatusDb,
  account: { id: string; planType?: string | null; fleetVehicleCount?: number | null },
) {
  const registeredVehicleCount = await db.vehicle.count({ where: { accountId: account.id } });
  return { fleet: isFleetAccount(account, registeredVehicleCount), registeredVehicleCount };
}

/**
 * Fleet accounts must declare driver + vehicle; individual accounts declare nothing.
 * India is intentionally exempt (handled by callers): EXECUTION_PLAN §1 keeps India
 * unchanged, and a different driver model for India comes later.
 */
export function parseDriverDeclaration(
  fleetStatus: { fleet: boolean },
  body: unknown,
): DeclarationResult {
  if (!fleetStatus.fleet) return { ok: true, value: { fleet: false } };
  const parsed = parseFleetDriverInput(body);
  if (!parsed.ok) return { ok: false, status: 400, error: parsed.error };
  const secret = licenceHashSecret();
  if (!secret) return { ok: false, status: 503, error: "Driver records are temporarily unavailable. Please try again later." };
  return {
    ok: true,
    value: {
      fleet: true as const,
      driverName: parsed.value.driverName,
      licenceHash: hashLicenceNumber(parsed.value.licence, secret),
      licenceLast4: licenceLast4(parsed.value.licence),
      vehicleId: parsed.value.vehicleId,
    },
  };
}

type AssignmentDb = {
  vehicle: { findFirst(args: any): Promise<{ id: string; regPlate: string; vehicleType: string } | null> };
  user: { findFirst(args: any): Promise<{ name: string } | null> };
  driverIdentity: {
    findUnique(args: any): Promise<{ licenceHash: string; licenceLast4: string; accountId?: string } | null>;
  };
};

/**
 * A licence registered as another account's own driver (DriverIdentity) cannot be named
 * on this fleet's jobs: one verified person is a driver on only one account (§6).
 * Same neutral error as any other declaration refusal; no account is revealed.
 */
export function fleetLicenceConflict(identity: { accountId?: string } | null, fleetAccountId: string) {
  return Boolean(identity && identity.accountId && identity.accountId !== fleetAccountId);
}

export type AssignmentData = {
  accountId: string;
  vehicleId: string;
  vehicleRegPlate: string;
  vehicleType: string;
  driverName: string;
  licenceHash: string | null;
  licenceLast4: string | null;
  source: "fleet_declared" | "account_driver";
};

/**
 * Resolve who drives and in which vehicle. Throws "DRIVER_VEHICLE_NOT_VERIFIED" when a
 * declared fleet vehicle is not an eligible vehicle of the right type on this account.
 * Returns null only for tester/QA accounts that are exempt from vehicle eligibility and
 * have no matching vehicle; real accounts always get a record.
 */
export async function resolveJobDriverAssignment(
  db: AssignmentDb,
  input: { accountId: string; declaration: DriverDeclaration; vehicleType: string; market: VehicleMarket; requireEligibleVehicle: boolean },
): Promise<AssignmentData | null> {
  const { accountId, declaration, vehicleType, market, requireEligibleVehicle } = input;
  const eligibility = requireEligibleVehicle ? vehicleEligibilityWhere(market, vehicleType) : { vehicleType };
  const select = { id: true, regPlate: true, vehicleType: true };

  if (declaration.fleet) {
    const registered = await db.driverIdentity.findUnique({
      where: { licenceHash: declaration.licenceHash },
      select: { accountId: true },
    });
    if (fleetLicenceConflict(registered, accountId)) throw new Error("DRIVER_LICENCE_NOT_ACCEPTED");
    const vehicle = await db.vehicle.findFirst({
      where: { accountId, id: declaration.vehicleId, ...eligibility },
      select,
    });
    if (!vehicle) throw new Error("DRIVER_VEHICLE_NOT_VERIFIED");
    return {
      accountId,
      vehicleId: vehicle.id,
      vehicleRegPlate: vehicle.regPlate,
      vehicleType: vehicle.vehicleType,
      driverName: declaration.driverName,
      licenceHash: declaration.licenceHash,
      licenceLast4: declaration.licenceLast4,
      source: "fleet_declared",
    };
  }

  if (!requireEligibleVehicle) return null;
  const vehicle = await db.vehicle.findFirst({ where: { accountId, ...eligibility }, select, orderBy: { verifiedAt: "asc" } });
  if (!vehicle) throw new Error("DRIVER_VEHICLE_NOT_VERIFIED");
  const [user, identity] = await Promise.all([
    db.user.findFirst({ where: { accountId }, select: { name: true }, orderBy: { createdAt: "asc" } }),
    db.driverIdentity.findUnique({ where: { accountId }, select: { licenceHash: true, licenceLast4: true } }),
  ]);
  return {
    accountId,
    vehicleId: vehicle.id,
    vehicleRegPlate: vehicle.regPlate,
    vehicleType: vehicle.vehicleType,
    driverName: user?.name || "Account driver",
    licenceHash: identity?.licenceHash ?? null,
    licenceLast4: identity?.licenceLast4 ?? null,
    source: "account_driver",
  };
}

/** Neutral refusal for a declared licence that belongs to another account's driver. */
export const FLEET_LICENCE_NOT_ACCEPTED =
  "We could not accept this driver for the job. Check the licence number, or contact support.";

type RevalidationDb = {
  account: { findUnique(args: any): Promise<{ id: string; companyName: string; planType: string | null; fleetVehicleCount: number | null } | null> };
  vehicle: {
    findMany(args: any): Promise<Array<{
      id: string; regPlate: string; verificationStatus: string; rejectionCount: number;
      registeredKeeperType: string | null; registeredKeeperName: string | null;
      leaseAgreementUrl: string | null; insurancePolicyholderName: string | null;
    }>>;
    update(args: any): Promise<unknown>;
  };
  notification: { create(args: any): Promise<unknown> };
  adminAuditEvent: { create(args: any): Promise<unknown> };
};

/**
 * Re-check every verified vehicle against the fleet rules using the account's state
 * AFTER a change (vehicle added, plan changed). Vehicles that now fail go back to
 * "failed" with a reason and the §5 correction window, and the owner is notified.
 * Call inside the same transaction as the change. Returns the vehicles moved.
 */
export async function revalidateFleetVehicles(db: RevalidationDb, accountId: string, actor: string, now = new Date()) {
  const account = await db.account.findUnique({
    where: { id: accountId },
    select: { id: true, companyName: true, planType: true, fleetVehicleCount: true },
  });
  if (!account) return [];
  const vehicles = await db.vehicle.findMany({
    where: { accountId },
    select: {
      id: true, regPlate: true, verificationStatus: true, rejectionCount: true,
      registeredKeeperType: true, registeredKeeperName: true, leaseAgreementUrl: true, insurancePolicyholderName: true,
    },
  });
  const failing = vehiclesFailingFleetRevalidation(account, vehicles);
  for (const { vehicle, problems } of failing) {
    const rejectionCount = vehicle.rejectionCount + 1;
    const correctionDeadline = vehicleCorrectionDeadline(rejectionCount, now);
    const reason = "Your account is now a fleet. " + problems.join(" ");
    await db.vehicle.update({
      where: { id: vehicle.id },
      data: { verificationStatus: "failed", verifiedAt: null, reviewedAt: now, rejectionReason: reason, rejectionCount, correctionDeadline },
    });
    await db.adminAuditEvent.create({
      data: {
        actor, action: "VEHICLE_FLEET_REVALIDATION_FAILED", entityType: "Vehicle", entityId: vehicle.id,
        details: { accountId, problems, rejectionCount, correctionDeadline: correctionDeadline?.toISOString() ?? null },
      },
    });
    await db.notification.create({
      data: {
        accountId, type: "vehicle_rejected", title: "Vehicle needs fleet documents",
        body: correctionDeadline
          ? `Your vehicle ${vehicle.regPlate} can no longer be used for jobs: ${reason} Correct it free of charge by ${correctionDeadline.toISOString().slice(0, 10)}.`
          : `Your vehicle ${vehicle.regPlate} can no longer be used for jobs: ${reason} A new check is needed.`,
        eventKey: `vehicle-fleet-revalidation:${vehicle.id}:${rejectionCount}`,
        metadata: { vehicleId: vehicle.id, rejectionCount },
      },
    });
  }
  return failing.map((entry) => entry.vehicle.id);
}

/** Error shown when a declared or recorded vehicle fails the check. */
export const DRIVER_VEHICLE_ERROR =
  "Choose a verified vehicle of the required type on your account, with current insurance and any required inspection.";
