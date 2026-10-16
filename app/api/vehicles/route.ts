import { withApiMetrics } from "@/lib/apiMetrics";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { VEHICLE_TYPES } from "@/lib/vehicles";

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

    return NextResponse.json({ vehicles, isTester: account.isTester, testerApprovalStatus: account.testerApprovalStatus });
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

    const body = await req.json();
    const vehicleType = String(body.vehicleType ?? "").trim();
    const regPlate = String(body.regPlate ?? "").trim().toUpperCase();
    const ownershipType = String(body.ownershipType ?? "").trim();
    const make = String(body.make ?? "").trim();
    const model = String(body.model ?? "").trim();
    const operatorLicenceNo = String(body.operatorLicenceNo ?? "").trim();
    const mamKg = body.mamKg === "" || body.mamKg == null ? null : Number(body.mamKg);
    const v5cDocumentUrl = String(body.v5cDocumentUrl ?? "").trim();
    const insuranceDocumentUrl = String(body.insuranceDocumentUrl ?? "").trim();
    const motValidUntil = body.motValidUntil ? new Date(body.motValidUntil) : null;
    const insuranceValidUntil = body.insuranceValidUntil ? new Date(body.insuranceValidUntil) : null;

    if (!VEHICLE_TYPES.includes(vehicleType)) {
      return NextResponse.json({ error: "Select a valid vehicle type." }, { status: 400 });
    }
    if (!regPlate || regPlate.length > 20 || !/^[A-Z0-9 -]+$/.test(regPlate)) {
      return NextResponse.json({ error: "Enter a valid registration plate." }, { status: 400 });
    }
    if (!["owned", "leased", "rented", "other"].includes(ownershipType)) {
      return NextResponse.json({ error: "Select the vehicle ownership type." }, { status: 400 });
    }
    if (mamKg !== null && (!Number.isInteger(mamKg) || mamKg < 1 || mamKg > 100000)) {
      return NextResponse.json({ error: "MAM must be a valid weight in kilograms." }, { status: 400 });
    }

    for (const [name, value] of [["V5C document URL", v5cDocumentUrl], ["Insurance document URL", insuranceDocumentUrl]] as const) {
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
    if (!account.isTester && account.testerApprovalStatus !== "pending") {
      if (!insuranceValidUntil || Number.isNaN(insuranceValidUntil.getTime()) || insuranceValidUntil <= now) {
        return NextResponse.json({ error: "Enter an insurance expiry date in the future." }, { status: 400 });
      }
      if (!motValidUntil || Number.isNaN(motValidUntil.getTime()) || motValidUntil <= now) {
        return NextResponse.json({ error: "Enter an MOT expiry date in the future. If exempt, contact support for review." }, { status: 400 });
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
