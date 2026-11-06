/*
 * Per-job driver record (EXECUTION_PLAN §6). Every job a FLEET accepts or wins records
 * the driver name, licence (keyed hash + last 4) and the vehicle used; individual drivers
 * get their own name, recorded licence and approved vehicle. The poster sees name,
 * licence last 4 and registration only after acceptance (see driverRecordView).
 */
import { hashLicenceNumber, licenceHashSecret, licenceLast4 } from "@/lib/driverLicence";
import { vehicleEligibilityWhere, type VehicleMarket } from "@/lib/eligibility";
import { isFleetAccount, parseFleetDriverInput } from "@/lib/vehicleApproval";

export type DriverDeclaration =
  | { fleet: false }
  | { fleet: true; driverName: string; licenceHash: string; licenceLast4: string; vehicleId: string };

export type DeclarationResult = { ok: true; value: DriverDeclaration } | { ok: false; status: number; error: string };

/** Fleet accounts must declare driver + vehicle; individual accounts declare nothing. */
export function parseDriverDeclaration(
  account: { planType?: string | null; fleetVehicleCount?: number | null },
  body: unknown,
): DeclarationResult {
  if (!isFleetAccount(account)) return { ok: true, value: { fleet: false } };
  const parsed = parseFleetDriverInput(body);
  if (!parsed.ok) return { ok: false, status: 400, error: parsed.error };
  const secret = licenceHashSecret();
  if (!secret) return { ok: false, status: 503, error: "Driver records are temporarily unavailable. Please try again later." };
  return {
    ok: true,
    value: {
      fleet: true,
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
  driverIdentity: { findUnique(args: any): Promise<{ licenceHash: string; licenceLast4: string } | null> };
};

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

/** Error shown when a declared or recorded vehicle fails the check. */
export const DRIVER_VEHICLE_ERROR =
  "Choose a verified vehicle of the required type on your account, with current insurance and any required inspection.";
