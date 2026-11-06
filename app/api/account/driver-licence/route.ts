import { withApiMetrics } from "@/lib/apiMetrics";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { Prisma } from "@prisma/client";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { readBoundedJson } from "@/lib/requestBody";
import { enforceRateLimit } from "@/lib/rateLimit";
import { normaliseLicenceNumber } from "@/lib/vehicleApproval";
import { hashLicenceNumber, licenceHashSecret, licenceLast4, LICENCE_NOT_ACCEPTED_MESSAGE } from "@/lib/driverLicence";

/*
 * Driver step: record the account's driving licence (EXECUTION_PLAN §6).
 * One verified person can be the driver on only one account, so the keyed hash is
 * unique across accounts. A duplicate gets the same neutral message as any other
 * refusal so the endpoint cannot be used to learn whether a licence is registered.
 */

async function currentAccount() {
  const session = await getServerSession(authOptions);
  const accountId = (session?.user as { accountId?: string } | undefined)?.accountId;
  if (!accountId) return null;
  const account = await prisma.account.findUnique({
    where: { id: accountId },
    select: { id: true, type: true, verificationStatus: true, deletionRequestedAt: true },
  });
  if (!account || account.deletionRequestedAt) return null;
  return account;
}

async function GETHandler() {
  const account = await currentAccount();
  if (!account) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const identity = await prisma.driverIdentity.findUnique({
    where: { accountId: account.id },
    select: { licenceLast4: true, createdAt: true },
  });
  return NextResponse.json(
    { recorded: Boolean(identity), licenceLast4: identity?.licenceLast4 ?? null, recordedAt: identity?.createdAt ?? null },
    { headers: { "Cache-Control": "private, no-store" } },
  );
}

async function POSTHandler(req: Request) {
  const account = await currentAccount();
  if (!account) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  if (account.verificationStatus === "suspended") {
    return NextResponse.json({ error: "Suspended accounts cannot update driver details." }, { status: 403 });
  }
  if (account.type !== "driver" && account.type !== "both") {
    return NextResponse.json({ error: "Your account is not registered for driving." }, { status: 403 });
  }
  const limited = await enforceRateLimit(req, { scope: "driver-licence-record", identity: account.id, limit: 5, windowMs: 60 * 60 * 1000 });
  if (limited) return limited;

  const parsed = await readBoundedJson(req, 2 * 1024);
  if (!parsed.ok) {
    return NextResponse.json({ error: parsed.status === 413 ? "Request body is too large." : "Invalid request body." }, { status: parsed.status });
  }
  const body = parsed.value && typeof parsed.value === "object" && !Array.isArray(parsed.value) ? (parsed.value as Record<string, unknown>) : {};
  const normalised = normaliseLicenceNumber(body.licenceNumber);
  if (!normalised) {
    return NextResponse.json({ error: "Enter the driving licence number (5–20 letters and digits)." }, { status: 400 });
  }

  const secret = licenceHashSecret();
  if (!secret) {
    console.error("Driver licence hashing secret is not configured.");
    return NextResponse.json({ error: "Driver details cannot be recorded right now. Please try again later." }, { status: 503 });
  }
  const licenceHash = hashLicenceNumber(normalised, secret);

  const existing = await prisma.driverIdentity.findUnique({ where: { accountId: account.id }, select: { licenceHash: true } });
  if (existing) {
    // Re-submitting the same licence is idempotent; changing it needs support review.
    if (existing.licenceHash === licenceHash) return NextResponse.json({ success: true, licenceLast4: licenceLast4(normalised) });
    return NextResponse.json({ error: "A driving licence is already recorded for this account. Contact support to change it." }, { status: 409 });
  }

  try {
    await prisma.driverIdentity.create({
      data: { accountId: account.id, licenceHash, licenceLast4: licenceLast4(normalised) },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === "P2002") {
      return NextResponse.json({ error: LICENCE_NOT_ACCEPTED_MESSAGE }, { status: 409 });
    }
    console.error("Driver licence record failed.", { errorName: error instanceof Error ? error.name : "UnknownError" });
    return NextResponse.json({ error: "Could not record the driving licence." }, { status: 500 });
  }
  return NextResponse.json({ success: true, licenceLast4: licenceLast4(normalised) }, { status: 201 });
}

export const GET = withApiMetrics("/api/account/driver-licence", GETHandler);
export const POST = withApiMetrics("/api/account/driver-licence", POSTHandler);
