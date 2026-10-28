import { withApiMetrics } from "@/lib/apiMetrics";
import { NextResponse } from "next/server";
import { createHash, randomBytes } from "crypto";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { readBoundedJson } from "@/lib/requestBody";
import { prisma } from "@/lib/prisma";
import { isTesterAdmin } from "@/lib/testerAdmin";
import { getPromotion, calculatePromotionalEnd } from "@/lib/promotion";
import { emailVerificationEnabled } from "@/lib/emailVerification";

async function GETHandler() {
  if (!(await isTesterAdmin())) {
    const session = await getServerSession(authOptions);
    return NextResponse.json({ error: session ? "Admin access required." : "Not logged in." }, { status: session ? 403 : 401 });
  }

  const applications = await prisma.account.findMany({
    where: { testerApprovalStatus: "pending" },
    orderBy: { createdAt: "asc" },
    select: {
      id: true,
      companyName: true,
      companyNumber: true,
      isSoleTrader: true,
      country: true,
      currency: true,
      planType: true,
      fleetVehicleCount: true,
      createdAt: true,
      verificationStatus: true,
      users: { select: { name: true, email: true, phone: true, role: true, emailVerifiedAt: true } },
      vehicles: {
        select: {
          id: true, vehicleType: true, regPlate: true, ownershipType: true,
          make: true, model: true, mamKg: true, registrationRegion: true, v5cDocumentUrl: true,
          insuranceDocumentUrl: true, operatorLicenceNo: true,
          motValidUntil: true, insuranceValidUntil: true, verificationStatus: true,
        },
      },
    },
  });

  const accessCodes = await prisma.testerAccessCode.findMany({
    orderBy: { createdAt: "desc" },
    select: {
      id: true, createdAt: true, claimedAt: true, claimedByAccountId: true,
    },
  });
  const claimedIds = accessCodes.map((code) => code.claimedByAccountId).filter((id): id is string => Boolean(id));
  const claimedAccounts = claimedIds.length
    ? await prisma.account.findMany({
        where: { id: { in: claimedIds } },
        select: { id: true, companyName: true, companyNumber: true, isSoleTrader: true, country: true, currency: true, planType: true, fleetVehicleCount: true, users: { select: { name: true, email: true, phone: true, role: true } } },
      })
    : [];
  const claimedAccountById = new Map(claimedAccounts.map((account) => [account.id, account]));
  const accessCodesWithRecipients = accessCodes.map((code) => ({
    ...code,
    claimedByAccount: code.claimedByAccountId ? claimedAccountById.get(code.claimedByAccountId) ?? null : null,
  }));

  return NextResponse.json({ applications, accessCodes: accessCodesWithRecipients });
}

async function POSTHandler(req: Request) {
  if (!(await isTesterAdmin())) {
    const session = await getServerSession(authOptions);
    return NextResponse.json({ error: session ? "Admin access required." : "Not logged in." }, { status: session ? 403 : 401 });
  }

  const parsedBody = await readBoundedJson(req, 4 * 1024);
  if (!parsedBody.ok) {
    return NextResponse.json(
      { error: parsedBody.status === 413 ? "Request body is too large." : "Invalid request body." },
      { status: parsedBody.status },
    );
  }
  if (!parsedBody.value || typeof parsedBody.value !== "object" || Array.isArray(parsedBody.value)) {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const body = parsedBody.value as { action?: unknown; accountId?: unknown; decision?: unknown };

  if (body.action === "generate-code") {
    const rawCode = "P2D-" + randomBytes(2).toString("hex").toUpperCase() + "-" + randomBytes(2).toString("hex").toUpperCase() + "-" + randomBytes(2).toString("hex").toUpperCase();
    const codeHash = createHash("sha256").update(rawCode).digest("hex");
    await prisma.testerAccessCode.create({ data: { codeHash } });
    return NextResponse.json({ success: true, code: rawCode });
  }

  const accountId = typeof body.accountId === "string" ? body.accountId : "";
  const decision = body.decision;
  if (!accountId || (decision !== "approve" && decision !== "reject")) {
    return NextResponse.json({ error: "Choose an application and approve or reject it." }, { status: 400 });
  }

  const account = await prisma.account.findUnique({ where: { id: accountId }, include: { vehicles: { select: { id: true } }, users: { select: { emailVerifiedAt: true } } } });
  if (!account || account.testerApprovalStatus !== "pending") {
    return NextResponse.json({ error: "This tester application is no longer pending." }, { status: 409 });
  }

  if (decision === "reject") {
    const updated = await prisma.account.updateMany({
      where: { id: accountId, testerApprovalStatus: "pending" },
      data: { testerApprovalStatus: "rejected", isTester: false },
    });
    if (updated.count !== 1) return NextResponse.json({ error: "This application has already been reviewed." }, { status: 409 });
    return NextResponse.json({ success: true, decision: "rejected" });
  }

  if (account.vehicles.length === 0) {
    return NextResponse.json({ error: "The applicant must submit at least one vehicle before tester approval." }, { status: 409 });
  }

  if (emailVerificationEnabled() && account.users.some((user) => !user.emailVerifiedAt)) {
    return NextResponse.json({ error: "The tester must verify their email before approval." }, { status: 409 });
  }

  if (account.country !== "GB" || account.currency !== "GBP") {
    return NextResponse.json({ error: "Tester approval is only available for GB + GBP accounts." }, { status: 400 });
  }

  const promotion = await getPromotion();
  const now = new Date();
  if (!promotion.active || now < promotion.startAt || now > promotion.endAt) {
    return NextResponse.json({ error: "The UK promotion is not active, so a tester trial cannot be started." }, { status: 409 });
  }
  const freeEndsAt = await calculatePromotionalEnd({
    country: account.country,
    currency: account.currency,
    planType: account.planType,
    trialStartedAt: now,
    freeMonthsEarned: 0,
  });
  if (!freeEndsAt) {
    return NextResponse.json({ error: "Unable to calculate the promotional end date." }, { status: 500 });
  }

  const updated = await prisma.account.updateMany({
    where: { id: accountId, testerApprovalStatus: "pending", isTester: false },
    data: {
      testerApprovalStatus: "approved",
      isTester: true,
      promotionParticipant: true,
      trialStartedAt: now,
      trialEndsAt: freeEndsAt,
      freeEndsAt,
      freeMonthsEarned: 0,
      extensionCount: 0,
      subscriptionStatus: "promotional",
      lastActivityAt: now,
      inactiveSince: null,
    },
  });
  if (updated.count !== 1) return NextResponse.json({ error: "This application has already been reviewed." }, { status: 409 });

  return NextResponse.json({ success: true, decision: "approved", freeEndsAt });
}

export const GET = withApiMetrics("/api/admin/testers", GETHandler);
export const POST = withApiMetrics("/api/admin/testers", POSTHandler);
