import { withApiMetrics } from "@/lib/apiMetrics";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { VEHICLE_TYPES } from "@/lib/vehicles";
import { getLocalisationProfile, getJurisdictionOptions } from "@/lib/localisation";

function parseOptionalDateField(value: unknown, label: string): { date: Date | null; dateKey: string | null; error: string | null } {
  if (value === undefined || value === null || value === "") {
    return { date: null, dateKey: null, error: null };
  }
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return { date: null, dateKey: null, error: `${label} must be a valid calendar date.` };
  }
  const date = new Date(`${value}T00:00:00.000Z`);
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    return { date: null, dateKey: null, error: `${label} must be a valid calendar date.` };
  }
  return { date, dateKey: value, error: null };
}

function marketDateKey(value: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

async function currentAccount() {
  const session = await getServerSession(authOptions);
  const accountId = (session?.user as any)?.accountId;
  if (!accountId) return null;
  return prisma.account.findUnique({ where: { id: accountId } });
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

    if (account.type !== "driver" && account.type !== "both") {
      return NextResponse.json({ error: "Your account is not registered for driving." }, { status: 403 });
    }

    const marketProfile = getLocalisationProfile({ country: account.country, currency: account.currency });
    let body: any;
    try {
      body = await req.json();
    } catch {
      return NextResponse.json({ error: "Request body must be valid JSON." }, { status: 400 });
    }
    if (!body || typeof body !== "object" || Array.isArray(body)) {
      return NextResponse.json({ error: "Vehicle details must be sent as a JSON object." }, { status: 400 });
    }
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
    if (!account.isTester && account.testerApprovalStatus !== "pending") {
      // Date inputs represent whole local calendar days. Treat today's expiry as valid
      // through the end of that market day instead of rejecting it at midnight UTC.
      if (!insuranceValidUntil || !insuranceDate.dateKey || insuranceDate.dateKey < todayInMarket) {
        return NextResponse.json({ error: "Enter an insurance expiry date that has not passed." }, { status: 400 });
      }
      if (marketProfile?.inspectionRequiredAtCountryLevel && (!motValidUntil || !motDate.dateKey || motDate.dateKey < todayInMarket)) {
        return NextResponse.json({ error: `Enter a valid current or future ${marketProfile.inspectionLabel} date. If the vehicle is exempt, contact support for review.` }, { status: 400 });
      }
    }

    const duplicate = await prisma.vehicle.findFirst({
      where: { regPlate, accountId: account.id },
    });
    if (duplicate) {
      return NextResponse.json({ error: "This registration is already on your account." }, { status: 409 });
    }

    const vehicle = await prisma.vehicle.create({
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
        verificationStatus: "pending",
        verifiedAt: null,
      },
    });

    return NextResponse.json({
      success: true,
      vehicle,
      message: account.isTester ? "Tester access enabled. This vehicle remains pending and is not marked verified." : account.testerApprovalStatus === "pending" ? "Vehicle details submitted for tester review. This vehicle remains unverified and access is not enabled until an administrator approves the application." : "Vehicle submitted for verification. It cannot qualify for jobs until approved.",
    }, { status: 201 });
  } catch (error) {
    console.error("Vehicle registration error:", error);
    return NextResponse.json({ error: "Could not register vehicle." }, { status: 500 });
  }
}

export const GET = withApiMetrics("/api/vehicles", GETHandler);
export const POST = withApiMetrics("/api/vehicles", POSTHandler);
