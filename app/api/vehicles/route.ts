import { withApiMetrics } from "@/lib/apiMetrics";
import { NextResponse } from "next/server";
import { readBoundedJson } from "@/lib/requestBody";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { VEHICLE_TYPES } from "@/lib/vehicles";
import { getLocalisationProfile, getJurisdictionOptions } from "@/lib/localisation";
import { marketDateKey, parseOptionalDateField } from "@/lib/vehicleDates";

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

    return NextResponse.json({ vehicles, isTester: account.isTester, testerApprovalStatus: account.testerApprovalStatus, market: { country: account.country, currency: account.currency } });
  } catch (error) {
    console.error("Vehicle list error:", error);
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
      return NextResponse.json({ error: "Vehicle details must be sent as a JSON object." }, { status: 400 });
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

    const created = await prisma.vehicle.create({
      data: {
        accountId: account.id,
        vehicleType,
        regPlate,
        registrationRegion: registrationRegion || null,
        ownershipType,
        make: make || null,
        model: model || null,
        mamKg,
        operatorLicenceNo: operatorLicenceNo || null,
        v5cDocumentUrl: v5cDocumentUrl || null,
        insuranceDocumentUrl: insuranceDocumentUrl || null,
        motValidUntil,
        insuranceValidUntil,
      },
    });

    return NextResponse.json({ success: true, vehicle: created }, { status: 201 });
  } catch (error) {
    console.error("Vehicle creation error:", error);
    return NextResponse.json({ error: "Could not save vehicle details." }, { status: 500 });
  }
}

export const GET = withApiMetrics("/api/vehicles", GETHandler);
export const POST = withApiMetrics("/api/vehicles", POSTHandler);
