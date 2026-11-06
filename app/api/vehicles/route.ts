import { withApiMetrics } from "@/lib/apiMetrics";
import { recordVehicleAddedFees } from "@/lib/verification";
import { NextResponse } from "next/server";
import { readBoundedJson } from "@/lib/requestBody";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { VEHICLE_TYPES } from "@/lib/vehicles";
import { getLocalisationProfile, getJurisdictionOptions } from "@/lib/localisation";
import { marketDateKey, parseOptionalDateField } from "@/lib/vehicleDates";
import { isFleetAccount, isInsuranceCoverType, isKeeperType } from "@/lib/vehicleApproval";


function validHttpUrl(value: string) {
  try {
    const url = new URL(value);
    return url.protocol === "https:" || url.protocol === "http:";
  } catch {
    return false;
  }
}

/**
 * Ownership and insurance evidence (EXECUTION_PLAN §6). Optional at submission so
 * a vehicle can be saved and completed later; required by the admin approval rules.
 */
function parseOwnershipEvidence(body: Record<string, unknown>) {
  const text = (key: string, max: number) => {
    const value = body[key];
    if (value === undefined || value === null) return { value: undefined as string | null | undefined };
    if (typeof value !== "string") return { error: true as const };
    const trimmed = value.trim();
    if (trimmed.length > max) return { error: true as const };
    return { value: trimmed || null };
  };
  const keeperType = text("registeredKeeperType", 20);
  const keeperName = text("registeredKeeperName", 120);
  const leaseUrl = text("leaseAgreementUrl", 500);
  const policyholder = text("insurancePolicyholderName", 120);
  const coverType = text("insuranceCoverType", 20);
  const policyNumber = text("insurancePolicyNumber", 60);
  if ("error" in keeperType || (keeperType.value && !isKeeperType(keeperType.value))) {
    return { error: "Select whether the registered keeper is a company or an individual." };
  }
  if ("error" in keeperName) return { error: "Registered keeper name must be 120 characters or fewer." };
  if ("error" in leaseUrl || (leaseUrl.value && !validHttpUrl(leaseUrl.value))) {
    return { error: "Lease or hire agreement must be a valid HTTP or HTTPS URL." };
  }
  if ("error" in policyholder) return { error: "Insurance policyholder name must be 120 characters or fewer." };
  if ("error" in coverType || (coverType.value && !isInsuranceCoverType(coverType.value))) {
    return { error: "Select the insurance cover type." };
  }
  if ("error" in policyNumber) return { error: "Insurance policy number must be 60 characters or fewer." };
  return {
    data: {
      registeredKeeperType: keeperType.value,
      registeredKeeperName: keeperName.value,
      leaseAgreementUrl: leaseUrl.value,
      insurancePolicyholderName: policyholder.value,
      insuranceCoverType: coverType.value,
      insurancePolicyNumber: policyNumber.value,
    },
  };
}

async function currentAccount() {
  const session = await getServerSession(authOptions);
  const accountId = (session?.user as any)?.accountId;
  if (!accountId) return null;
  const account = await prisma.account.findUnique({ where: { id: accountId } });
  if (!account || account.deletionRequestedAt) return null;
  return account;
}

async function GETHandler() {
  try {
    const account = await currentAccount();
    if (!account) {
      return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }

    const vehicles = await prisma.vehicle.findMany({
      where: { accountId: account.id },
      orderBy: { createdAt: "desc" },
    });

    // Same rule the accept/bid routes use to require a per-job driver declaration.
    return NextResponse.json({ vehicles, fleet: isFleetAccount(account), isTester: account.isTester, testerApprovalStatus: account.testerApprovalStatus, market: { country: account.country, currency: account.currency } });
  } catch (error) {
    console.error("Vehicle list failed.", { errorName: error instanceof Error ? error.name : "UnknownError" });
    return NextResponse.json({ error: "Could not load vehicles." }, { status: 500 });
  }
}

async function POSTHandler(req: Request) {
  try {
    const account = await currentAccount();
    if (!account) {
      return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }

    if (account.verificationStatus === "suspended") {
      return NextResponse.json({ error: "Suspended accounts cannot register vehicles." }, { status: 403 });
    }

    if (account.type !== "driver" && account.type !== "both") {
      return NextResponse.json({ error: "Your account is not registered for driving." }, { status: 403 });
    }

    const marketProfile = getLocalisationProfile({ country: account.country, currency: account.currency });
    const parsedBody = await readBoundedJson(req, 16 * 1024);
    if (!parsedBody.ok) {
      return NextResponse.json(
        { error: parsedBody.status === 413 ? "Request body is too large." : "Invalid request body." },
        { status: parsedBody.status },
      );
    }
    if (!parsedBody.value || typeof parsedBody.value !== "object" || Array.isArray(parsedBody.value)) {
      return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
    }
    const body = parsedBody.value as Record<string, unknown>;
    const vehicleType = String(body.vehicleType ?? "").trim();
    const regPlate = String(body.regPlate ?? "").trim().toUpperCase();
    const registrationRegion = String(body.registrationRegion ?? "").trim().toUpperCase();
    const ownershipType = String(body.ownershipType ?? "").trim();
    const make = String(body.make ?? "").trim();
    const model = String(body.model ?? "").trim();
    const operatorLicenceNo = String(body.operatorLicenceNo ?? "").trim();
    const mamKg = body.mamKg === "" || body.mamKg == null ? null : Number(body.mamKg);
    const v5cDocumentUrl = String(body.v5cDocumentUrl ?? "").trim();
    const insuranceDocumentUrl = String(body.insuranceDocumentUrl ?? "").trim();
    const motDate = parseOptionalDateField(body.motValidUntil, "Inspection expiry date");
    const insuranceDate = parseOptionalDateField(body.insuranceValidUntil, "Insurance expiry date");
    if (motDate.error) return NextResponse.json({ error: motDate.error }, { status: 400 });
    if (insuranceDate.error) return NextResponse.json({ error: insuranceDate.error }, { status: 400 });
    const motValidUntil = motDate.date;
    const insuranceValidUntil = insuranceDate.date;
    const evidence = parseOwnershipEvidence(body);
    if ("error" in evidence) return NextResponse.json({ error: evidence.error }, { status: 400 });

    if (!(VEHICLE_TYPES as readonly string[]).includes(vehicleType)) {
      return NextResponse.json({ error: "Select a valid vehicle type." }, { status: 400 });
    }
    if (!regPlate || regPlate.length > 20 || !/^[A-Z0-9 -]+$/.test(regPlate)) {
      return NextResponse.json({ error: "Enter a valid registration plate." }, { status: 400 });
    }
    const jurisdictionOptions = getJurisdictionOptions(account.country);
    if (marketProfile?.jurisdictionSelectionRequired && !registrationRegion) {
      return NextResponse.json({ error: "Select your vehicle registration jurisdiction." }, { status: 400 });
    }
    if (registrationRegion && !jurisdictionOptions.some((region) => region.code === registrationRegion)) {
      return NextResponse.json({ error: "Select a valid vehicle registration jurisdiction for your market." }, { status: 400 });
    }
    if (!["owned", "leased", "rented", "other"].includes(ownershipType)) {
      return NextResponse.json({ error: "Select the vehicle ownership type." }, { status: 400 });
    }
    if (mamKg !== null && (!Number.isInteger(mamKg) || mamKg < 1 || mamKg > 100000)) {
      return NextResponse.json({ error: "Enter a valid vehicle weight using the unit shown in the form." }, { status: 400 });
    }
    if (make.length > 60) {
      return NextResponse.json({ error: "Vehicle make must be 60 characters or fewer." }, { status: 400 });
    }
    if (model.length > 80) {
      return NextResponse.json({ error: "Vehicle model must be 80 characters or fewer." }, { status: 400 });
    }
    if (operatorLicenceNo.length > 40) {
      return NextResponse.json({ error: "Operator licence number must be 40 characters or fewer." }, { status: 400 });
    }

    for (const [name, value] of [[marketProfile?.registrationDocumentLabel ?? "Vehicle registration document", v5cDocumentUrl], ["Insurance document", insuranceDocumentUrl]] as const) {
      if (value) {
        try {
          const url = new URL(value);
          if (url.protocol !== "https:" && url.protocol !== "http:") throw new Error();
        } catch {
          return NextResponse.json({ error: `${name} must be a valid HTTP or HTTPS URL.` }, { status: 400 });
        }
      }
    }

    const now = new Date();
    const todayInMarket = marketDateKey(now, marketProfile?.timeZone ?? "UTC");
    if (account.country !== "IN" && !account.isTester && account.testerApprovalStatus !== "pending") {
      // Date inputs represent whole local calendar days. Treat today's expiry as valid
      // through the end of that market day instead of rejecting it at midnight UTC.
      if (!insuranceValidUntil || !insuranceDate.dateKey || insuranceDate.dateKey < todayInMarket) {
        return NextResponse.json({ error: "Enter an insurance expiry date that has not passed." }, { status: 400 });
      }
      if (marketProfile?.inspectionRequiredAtCountryLevel && (!motValidUntil || !motDate.dateKey || motDate.dateKey < todayInMarket)) {
        return NextResponse.json({ error: `Enter a valid current or future ${marketProfile.inspectionLabel} date. If the vehicle is exempt, contact support for review.` }, { status: 400 });
      }
    }

    // Serialize registrations for this account so simultaneous duplicate
    // submissions cannot both pass the preflight duplicate check.
    const vehicle = await prisma.$transaction(async (tx) => {
      await tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "Account" WHERE "id" = ${account.id} FOR UPDATE`;
      const duplicate = await tx.vehicle.findFirst({
        where: { regPlate, accountId: account.id },
        select: { id: true },
      });
      if (duplicate) return null;

      // Enforce fleet vehicle count cap (null = uncapped for legacy accounts)
      const existing = await tx.vehicle.count({ where: { accountId: account.id } });
      if (account.fleetVehicleCount != null) {
        if (existing >= account.fleetVehicleCount) {
          return { limitExceeded: true } as const;
        }
      }

      const created = await tx.vehicle.create({
        data: {
          accountId: account.id,
          vehicleType,
          regPlate,
          registrationRegion: registrationRegion || null,
          ownershipType,
          make: make || null,
          model: model || null,
          mamKg,
          v5cDocumentUrl: v5cDocumentUrl || null,
          insuranceDocumentUrl: insuranceDocumentUrl || null,
          operatorLicenceNo: operatorLicenceNo || null,
          motValidUntil,
          insuranceValidUntil,
          ...evidence.data,
          verificationStatus: "pending",
          verifiedAt: null,
        },
      });
      // Verification fees for this vehicle (EXECUTION_PLAN §5): driver upgrade or 0.50,
      // recorded as pending in the same transaction, idempotent per account/vehicle.
      await recordVehicleAddedFees(tx, account, created.id);
      return created;
    });
    if (!vehicle) {
      return NextResponse.json({ error: "This registration is already on your account." }, { status: 409 });
    }
    if ("limitExceeded" in vehicle) {
      return NextResponse.json(
        { error: `Your account plan allows up to ${account.fleetVehicleCount} vehicle${account.fleetVehicleCount === 1 ? "" : "s"}. Remove an existing vehicle or upgrade your plan.` },
        { status: 403 },
      );
    }

    return NextResponse.json({
      success: true,
      vehicle,
      message: account.isTester ? "Tester access enabled. This vehicle remains pending and is not marked verified." : account.testerApprovalStatus === "pending" ? "Vehicle details submitted for tester review. This vehicle remains unverified and access is not enabled until an administrator approves the application." : "Vehicle submitted for verification. It cannot qualify for jobs until approved.",
    }, { status: 201 });
  } catch (error) {
    console.error("Vehicle registration failed.", { errorName: error instanceof Error ? error.name : "UnknownError" });
    return NextResponse.json({ error: "Could not register vehicle." }, { status: 500 });
  }
}

/**
 * Owner updates documents/evidence on their own vehicle. Any change sends the vehicle
 * back to admin review (a verified vehicle stops qualifying until re-approved). A
 * rejected vehicle can be corrected free of charge only inside its correction window.
 */
async function PATCHHandler(req: Request) {
  try {
    const account = await currentAccount();
    if (!account) {
      return NextResponse.json({ error: "Authentication required." }, { status: 401 });
    }
    if (account.verificationStatus === "suspended") {
      return NextResponse.json({ error: "Suspended accounts cannot update vehicles." }, { status: 403 });
    }
    const parsedBody = await readBoundedJson(req, 16 * 1024);
    if (!parsedBody.ok) {
      return NextResponse.json(
        { error: parsedBody.status === 413 ? "Request body is too large." : "Invalid request body." },
        { status: parsedBody.status },
      );
    }
    if (!parsedBody.value || typeof parsedBody.value !== "object" || Array.isArray(parsedBody.value)) {
      return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
    }
    const body = parsedBody.value as Record<string, unknown>;
    const vehicleId = typeof body.vehicleId === "string" ? body.vehicleId.trim() : "";
    if (!vehicleId || vehicleId.length > 40) {
      return NextResponse.json({ error: "Choose a vehicle to update." }, { status: 400 });
    }
    const evidence = parseOwnershipEvidence(body);
    if ("error" in evidence) return NextResponse.json({ error: evidence.error }, { status: 400 });

    const documents: Record<string, string | null> = {};
    for (const key of ["v5cDocumentUrl", "insuranceDocumentUrl"] as const) {
      if (body[key] === undefined) continue;
      const value = typeof body[key] === "string" ? (body[key] as string).trim() : "";
      if (value && (value.length > 500 || !validHttpUrl(value))) {
        return NextResponse.json({ error: "Document links must be valid HTTP or HTTPS URLs." }, { status: 400 });
      }
      documents[key] = value || null;
    }
    const dates: Record<string, Date | null> = {};
    for (const [key, label] of [["motValidUntil", "Inspection expiry date"], ["insuranceValidUntil", "Insurance expiry date"]] as const) {
      if (body[key] === undefined) continue;
      const parsed = parseOptionalDateField(body[key], label);
      if (parsed.error) return NextResponse.json({ error: parsed.error }, { status: 400 });
      dates[key] = parsed.date;
    }

    const vehicle = await prisma.vehicle.findFirst({
      where: { id: vehicleId, accountId: account.id },
      select: { id: true, verificationStatus: true, correctionDeadline: true },
    });
    if (!vehicle) return NextResponse.json({ error: "Vehicle not found." }, { status: 404 });
    if (vehicle.verificationStatus === "failed" && (!vehicle.correctionDeadline || vehicle.correctionDeadline < new Date())) {
      return NextResponse.json({ error: "The free correction window for this vehicle has closed. A new check is needed; contact support to start one." }, { status: 409 });
    }

    const updated = await prisma.vehicle.update({
      where: { id: vehicle.id },
      data: {
        ...Object.fromEntries(Object.entries(evidence.data).filter(([, value]) => value !== undefined)),
        ...documents,
        ...dates,
        verificationStatus: "pending",
        verifiedAt: null,
      },
    });
    return NextResponse.json({ success: true, vehicle: updated, message: "Vehicle updated and sent for review. It cannot qualify for jobs until approved." });
  } catch (error) {
    console.error("Vehicle update failed.", { errorName: error instanceof Error ? error.name : "UnknownError" });
    return NextResponse.json({ error: "Could not update vehicle." }, { status: 500 });
  }
}

export const GET = withApiMetrics("/api/vehicles", GETHandler);
export const PATCH = withApiMetrics("/api/vehicles", PATCHHandler);
export const POST = withApiMetrics("/api/vehicles", POSTHandler);
