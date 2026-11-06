/*
 * Vehicle approval, fleet ownership/insurance rules, driver licence identity and
 * per-job driver records (EXECUTION_PLAN §6). Pure functions only,
 * so the rules can be exercised by scripts/qa/vehicle-approval-fleet-contract.mjs
 * without a database. Routes call these and enforce them server-side. Client-safe:
 * the keyed licence hash lives in lib/driverLicence.ts (server only).
 */
export const KEEPER_TYPES = ["company", "individual"] as const;
export const INSURANCE_COVER_TYPES = ["hire_and_reward", "fleet", "other"] as const;
/** Cover that permits carrying other people's goods for payment. */
export const COMMERCIAL_COVER_TYPES = ["hire_and_reward", "fleet"] as const;

export type KeeperType = (typeof KEEPER_TYPES)[number];
export type InsuranceCoverType = (typeof INSURANCE_COVER_TYPES)[number];

/** Correction windows after a failed check (§5): 10 working days, then a final 3. */
export const VEHICLE_CORRECTION_WORKING_DAYS = [10, 3] as const;

export function isKeeperType(value: unknown): value is KeeperType {
  return typeof value === "string" && (KEEPER_TYPES as readonly string[]).includes(value);
}

export function isInsuranceCoverType(value: unknown): value is InsuranceCoverType {
  return typeof value === "string" && (INSURANCE_COVER_TYPES as readonly string[]).includes(value);
}

/**
 * THE fleet definition, used everywhere (approval, re-validation, fixed accept, bid,
 * bid award, vehicles page). A FLEET account is a fleet plan, a plan sized for 2+
 * vehicles, or any account with 2+ registered vehicles. The registered count is
 * required so legacy accounts (fleetVehicleCount null, planType individual) that
 * have grown to 2+ vehicles are still treated as fleets. Load it with
 * loadFleetStatus (lib/jobDriverAssignment.ts) rather than computing it ad hoc.
 */
export function isFleetAccount(account: { planType?: string | null; fleetVehicleCount?: number | null }, registeredVehicleCount: number) {
  return account.planType === "fleet" || (account.fleetVehicleCount ?? 0) >= 2 || registeredVehicleCount >= 2;
}

/**
 * Compare a person/company name typed on a document with the account's company name.
 * Case, punctuation and "Limited"/"Ltd" spelling are ignored; anything else must match.
 */
export function normaliseEntityName(value: string | null | undefined) {
  return String(value ?? "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .replace(/\blimited\b/g, "ltd")
    .replace(/\s+/g, " ")
    .trim();
}

export function namesMatch(a: string | null | undefined, b: string | null | undefined) {
  const left = normaliseEntityName(a);
  return left.length > 0 && left === normaliseEntityName(b);
}

/** Policy identity used to record an insurance review once per policy on an account. */
export function insurancePolicyKey(policyholderName: string | null | undefined, policyNumber: string | null | undefined) {
  const holder = normaliseEntityName(policyholderName);
  const number = String(policyNumber ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (!holder || !number) return null;
  return holder + "|" + number;
}

export type ApprovalVehicle = {
  v5cDocumentUrl: string | null;
  insuranceDocumentUrl: string | null;
  insuranceValidUntil: Date | null;
  motValidUntil: Date | null;
  registeredKeeperType: string | null;
  registeredKeeperName: string | null;
  leaseAgreementUrl: string | null;
  insurancePolicyholderName: string | null;
  insuranceCoverType: string | null;
};

export type ApprovalAccount = {
  companyName: string;
  planType?: string | null;
  fleetVehicleCount?: number | null;
  hasDriverIdentity: boolean;
  /** Market requires a roadworthiness inspection (MOT in GB); from the localisation profile. */
  inspectionRequired: boolean;
};

/**
 * Fleet-only ownership rules: company keeper (or a lease/hire agreement) and the
 * company as insurance policyholder. Also used to re-validate already verified
 * vehicles when an account becomes a fleet.
 */
export function fleetOwnershipProblems(
  vehicle: Pick<ApprovalVehicle, "registeredKeeperType" | "registeredKeeperName" | "leaseAgreementUrl" | "insurancePolicyholderName">,
  companyName: string,
) {
  const problems: string[] = [];
  const companyKeeper = vehicle.registeredKeeperType === "company" && namesMatch(vehicle.registeredKeeperName, companyName);
  if (!companyKeeper && !vehicle.leaseAgreementUrl) {
    problems.push("Fleet vehicles must be kept by the company, or have a lease/hire agreement in the company's name.");
  }
  if (!namesMatch(vehicle.insurancePolicyholderName, companyName)) {
    problems.push("Fleet insurance must be held by the company named on the account.");
  }
  return problems;
}

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * Server-side approval rules. Returns the reasons a vehicle cannot be approved;
 * an empty list means the admin may approve it.
 */
export function vehicleApprovalProblems(
  vehicle: ApprovalVehicle,
  account: ApprovalAccount,
  registeredVehicleCount: number,
  now = new Date(),
) {
  const problems: string[] = [];
  if (!vehicle.v5cDocumentUrl) problems.push("Registration document is missing.");
  if (!vehicle.insuranceDocumentUrl) problems.push("Insurance document is missing.");
  if (!vehicle.insuranceValidUntil || vehicle.insuranceValidUntil.getTime() < now.getTime() - DAY_MS) {
    problems.push("Insurance expiry is missing or has passed.");
  }
  if (account.inspectionRequired && (!vehicle.motValidUntil || vehicle.motValidUntil.getTime() < now.getTime() - DAY_MS)) {
    problems.push("MOT / inspection expiry is missing or has passed.");
  }
  if (!isKeeperType(vehicle.registeredKeeperType) || !vehicle.registeredKeeperName?.trim()) {
    problems.push("Registered keeper type and name are required.");
  }
  if (!vehicle.insurancePolicyholderName?.trim()) problems.push("Insurance policyholder name is required.");
  if (!(COMMERCIAL_COVER_TYPES as readonly string[]).includes(vehicle.insuranceCoverType ?? "")) {
    problems.push("Commercial cover (hire and reward, or fleet) is required for paid jobs.");
  }

  if (isFleetAccount(account, registeredVehicleCount)) {
    problems.push(...fleetOwnershipProblems(vehicle, account.companyName));
  } else if (!account.hasDriverIdentity) {
    problems.push("The driver's licence number has not been recorded for this account.");
  }
  return problems;
}

/**
 * Blocker fix: a vehicle approved while the account was an individual must not stay
 * verified once the account becomes a fleet. Given the account state AFTER the change
 * (plan or vehicle count), returns every verified vehicle that now fails the fleet
 * ownership rules, with its reasons. An empty list when the account is not a fleet.
 */
export function vehiclesFailingFleetRevalidation<V extends { id: string; verificationStatus: string } & Parameters<typeof fleetOwnershipProblems>[0]>(
  account: { companyName: string; planType?: string | null; fleetVehicleCount?: number | null },
  vehicles: V[],
) {
  if (!isFleetAccount(account, vehicles.length)) return [];
  return vehicles
    .filter((vehicle) => vehicle.verificationStatus === "verified")
    .map((vehicle) => ({ vehicle, problems: fleetOwnershipProblems(vehicle, account.companyName) }))
    .filter((entry) => entry.problems.length > 0);
}

/** Add working days (Mon–Fri), in UTC. Bank holidays are not modelled. */
export function addWorkingDays(from: Date, days: number) {
  const result = new Date(from);
  let remaining = days;
  while (remaining > 0) {
    result.setUTCDate(result.getUTCDate() + 1);
    const day = result.getUTCDay();
    if (day !== 0 && day !== 6) remaining--;
  }
  return result;
}

/** Deadline for correcting a rejected vehicle; null after the final window is used. */
export function vehicleCorrectionDeadline(rejectionCount: number, now = new Date()) {
  const days = VEHICLE_CORRECTION_WORKING_DAYS[rejectionCount - 1];
  return days ? addWorkingDays(now, days) : null;
}

// ---------------------------------------------------------------------------
// Driving licence number (the keyed hash is in lib/driverLicence.ts)
// ---------------------------------------------------------------------------

/** Uppercase letters and digits only; UK numbers are 16 characters, other markets vary. */
export function normaliseLicenceNumber(raw: unknown) {
  if (typeof raw !== "string") return null;
  const value = raw.toUpperCase().replace(/[\s-]/g, "");
  return /^[A-Z0-9]{5,20}$/.test(value) ? value : null;
}

// ---------------------------------------------------------------------------
// Per-job driver record
// ---------------------------------------------------------------------------

export type FleetDriverInput = { driverName: string; licence: string; vehicleId: string };

/** Validate the driver/vehicle a fleet declares when accepting or bidding on a job. */
export function parseFleetDriverInput(body: unknown): { ok: true; value: FleetDriverInput } | { ok: false; error: string } {
  const record = body && typeof body === "object" && !Array.isArray(body) ? (body as Record<string, unknown>) : {};
  const driverName = typeof record.driverName === "string" ? record.driverName.trim().replace(/\s+/g, " ") : "";
  const licence = normaliseLicenceNumber(record.driverLicenceNumber);
  const vehicleId = typeof record.vehicleId === "string" ? record.vehicleId.trim() : "";
  if (driverName.length < 2 || driverName.length > 100) {
    return { ok: false, error: "Fleet accounts must name the driver for this job (2–100 characters)." };
  }
  if (!licence) return { ok: false, error: "Enter the driver's driving licence number (5–20 letters and digits)." };
  if (!vehicleId || vehicleId.length > 40) return { ok: false, error: "Choose the vehicle used for this job." };
  return { ok: true, value: { driverName, licence, vehicleId } };
}

const DRIVER_RECORD_VISIBLE_STATUSES = ["accepted", "in_transit", "delivered", "completed"];

/**
 * What a job party sees about the assigned driver: name, licence last 4 and the
 * vehicle registration, only once the job is matched. Never the licence hash.
 */
export function driverRecordView(
  assignment: { driverName: string; licenceLast4: string | null; vehicleRegPlate: string } | null | undefined,
  job: { status: string; posterId: string; acceptedById: string | null },
  viewerAccountId: string,
) {
  if (!assignment) return null;
  if (!DRIVER_RECORD_VISIBLE_STATUSES.includes(job.status)) return null;
  if (viewerAccountId !== job.posterId && viewerAccountId !== job.acceptedById) return null;
  return { driverName: assignment.driverName, licenceLast4: assignment.licenceLast4, vehicleRegPlate: assignment.vehicleRegPlate };
}

/** The 0.50 fee applies to every vehicle beyond the first (§5); India is fee-free. */
export function chargesAdditionalVehicleFee(existingVehicleCount: number, market: { country: string; currency: string }) {
  if (market.country === "IN" && market.currency === "INR") return false;
  return existingVehicleCount >= 1;
}
