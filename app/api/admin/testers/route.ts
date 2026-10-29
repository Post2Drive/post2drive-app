import { withApiMetrics } from "@/lib/apiMetrics";
import { NextResponse } from "next/server";
import { createHash, randomBytes } from "crypto";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { readBoundedJson } from "@/lib/requestBody";
import { prisma } from "@/lib/prisma";
import { isTesterAdmin } from "@/lib/testerAdmin";
import { isQaRunnerEnabled } from "@/lib/qaRunnerGuard";
import { hashPilotAccessCode } from "@/lib/pilotAccess";

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

  const adminSession = await getServerSession(authOptions);
  const actorCandidate = typeof adminSession?.user?.email === "string" ? adminSession.user.email : "";
  const actor = /^[a-zA-Z0-9._@-]{3,100}$/.test(actorCandidate) ? actorCandidate : "tester-admin-api";

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
  const body = parsedBody.value as { action?: unknown; accountId?: unknown; decision?: unknown; reason?: unknown; count?: unknown };

  if (body.action === "generate-pilot-codes") {
    if (!isQaRunnerEnabled()) {
      return NextResponse.json({ error: "UK-market QA codes can only be generated in the explicitly allow-listed staging environment." }, { status: 503 });
    }
    const requestedCount = body.count === undefined ? 10 : Number(body.count);
    if (!Number.isInteger(requestedCount) || requestedCount < 1 || requestedCount > 100) {
      return NextResponse.json({ error: "Generate between 1 and 100 single-use QA codes." }, { status: 400 });
    }
    const codes = Array.from({ length: requestedCount }, () => "P2D-UKQA-" + randomBytes(12).toString("hex").toUpperCase());
    await prisma.$transaction(async (tx) => {
      await tx.testerAccessCode.createMany({ data: codes.map(code => ({ codeHash: hashPilotAccessCode(code) })) });
      await tx.adminAuditEvent.create({
        data: {
          actor,
          action: "pilot_tester_codes_generated",
          entityType: "tester_access_code_batch",
          market: "GB",
          details: { count: requestedCount, prefix: "P2D-UKQA", singleUse: true, plaintextStored: false, stagingOnly: true },
        },
      });
    });
    return NextResponse.json({
      success: true,
      count: codes.length,
      codes,
      note: "Each code works once for one GB/GBP staging test account. Copy the list now; plaintext is not stored or retrievable.",
    }, { status: 201 });
  }

  if (body.action === "generate-code") {
    const rawCode = "P2D-" + randomBytes(2).toString("hex").toUpperCase() + "-" + randomBytes(2).toString("hex").toUpperCase() + "-" + randomBytes(2).toString("hex").toUpperCase();
    const codeHash = createHash("sha256").update(rawCode).digest("hex");
    const created = await prisma.$transaction(async (tx) => {
      const code = await tx.testerAccessCode.create({ data: { codeHash } });
      await tx.adminAuditEvent.create({
        data: {
          actor,
          action: "tester_access_code_generated",
          entityType: "tester_access_code",
          entityId: code.id,
          details: { codePrefix: "P2D", plaintextStored: false },
        },
      });
      return code;
    });
    return NextResponse.json({ success: true, code: rawCode, createdAt: created.createdAt.toISOString() }, { status: 201 });
  }

  const accountId = typeof body.accountId === "string" ? body.accountId.trim() : "";
  const decision = body.decision;
  const reason = typeof body.reason === "string" ? body.reason.trim() : "";
  if (!accountId || accountId.length > 128 || (decision !== "approve" && decision !== "reject")) {
    return NextResponse.json({ error: "Choose a valid application and approve or reject it." }, { status: 400 });
  }
  if (reason.length < 5 || reason.length > 1000) {
    return NextResponse.json({ error: "A review reason of 5–1000 characters is required." }, { status: 400 });
  }

  const account = await prisma.account.findUnique({ where: { id: accountId }, include: { vehicles: { select: { id: true } }, users: { select: { emailVerifiedAt: true } } } });
  if (!account || account.testerApprovalStatus !== "pending") {
    return NextResponse.json({ error: "This tester application is no longer pending." }, { status: 409 });
  }

  if (decision === "reject") {
    const reviewed = await prisma.$transaction(async (tx) => {
      const updated = await tx.account.updateMany({
        where: { id: accountId, testerApprovalStatus: "pending" },
        data: { testerApprovalStatus: "rejected", isTester: false },
      });
      if (updated.count !== 1) return false;
      await tx.adminAuditEvent.create({
        data: {
          actor,
          action: "tester_application_rejected",
          entityType: "account",
          entityId: accountId,
          market: account.country,
          details: { decision: "rejected", reason },
        },
      });
      return true;
    });
    if (!reviewed) return NextResponse.json({ error: "This application has already been reviewed." }, { status: 409 });
    return NextResponse.json({ success: true, decision: "rejected" });
  }

  if (emailVerificationEnabled() && account.users.some((user) => !user.emailVerifiedAt)) {
    return NextResponse.json({ error: "The tester must verify their email before approval." }, { status: 409 });
  }

  if (account.country !== "GB" || account.currency !== "GBP") {
    return NextResponse.json({ error: "Tester approval is only available for GB + GBP accounts." }, { status: 400 });
  }

  const now = new Date();
  // Tester access is a time-limited pilot entitlement, independent of public promotions.
  const freeEndsAt = new Date(now.getTime() + 90 * 24 * 60 * 60 * 1000);

  const reviewed = await prisma.$transaction(async (tx) => {
    const updated = await tx.account.updateMany({
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
    if (updated.count !== 1) return false;
    await tx.adminAuditEvent.create({
      data: {
        actor,
        action: "tester_application_approved",
        entityType: "account",
        entityId: accountId,
        market: account.country,
        details: { decision: "approved", reason, trialEndsAt: freeEndsAt.toISOString() },
      },
    });
    return true;
  });
  if (!reviewed) return NextResponse.json({ error: "This application has already been reviewed." }, { status: 409 });

  return NextResponse.json({ success: true, decision: "approved", freeEndsAt });
}

export const GET = withApiMetrics("/api/admin/testers", GETHandler);
export const POST = withApiMetrics("/api/admin/testers", POSTHandler);
