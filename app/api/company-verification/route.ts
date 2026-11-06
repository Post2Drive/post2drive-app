import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { readBoundedJson } from "@/lib/requestBody";
import { enforceRateLimit } from "@/lib/rateLimit";
import { isUkAccount } from "@/lib/uk";
import { withApiMetrics } from "@/lib/apiMetrics";
import { isStagingPilotQaAccount } from "@/lib/verification";
import { decideCompanySubmission, verificationPathFeeLines } from "@/lib/verificationProcess";
import { recordVerificationFee } from "@/lib/verificationFees";

async function POSTHandler(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Not logged in." }, { status: 401 });
  const accountId = (session.user as any).accountId as string | undefined;
  if (!accountId) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  const account = await prisma.account.findUnique({
    where: { id: accountId, deletionRequestedAt: null },
    select: {
      country: true, currency: true, verificationStatus: true, companyVerificationStatus: true,
      companyName: true, companyNumber: true, companyVerifiedAt: true, companyResponsibleUserId: true,
      phoneVerifiedAt: true, isTester: true, qaTestAccounts: { select: { runId: true } },
    },
  });
  if (!account) return NextResponse.json({ error: "Account not found." }, { status: 404 });
  if (account.verificationStatus === "suspended") {
    return NextResponse.json({ error: "Suspended accounts cannot submit company verification." }, { status: 403 });
  }
  // Company verification is a UK marketplace requirement only. India remains
  // an open marketplace and must never be forced through person/company checks.
  if (!isUkAccount(account)) {
    return NextResponse.json({ error: "Company verification is only available to GB + GBP accounts." }, { status: 403 });
  }

  const limit = await enforceRateLimit(req, { scope: "company-verification-submit", identity: accountId, limit: 5, windowMs: 60 * 60 * 1000 });
  if (limit) return limit;

  const parsed = await readBoundedJson(req, 8 * 1024);
  if (!parsed.ok) return NextResponse.json({ error: parsed.status === 413 ? "Request body is too large." : "Invalid request body." }, { status: parsed.status });
  if (!parsed.value || typeof parsed.value !== "object" || Array.isArray(parsed.value)) {
    return NextResponse.json({ error: "Provide company details." }, { status: 400 });
  }

  const body = parsed.value as Record<string, unknown>;
  const companyName = typeof body.companyName === "string" ? body.companyName.trim() : "";
  const companyNumber = typeof body.companyNumber === "string" ? body.companyNumber.trim() : "";
  const isSoleTrader = body.isSoleTrader === true;
  if (companyName.length < 2 || companyName.length > 160 || companyNumber.length > 80) {
    return NextResponse.json({ error: "Enter a valid company or trading name and a company number no longer than 80 characters." }, { status: 400 });
  }

  // Order (non-India): email -> phone OTP -> person ID + company, with ONE
  // responsible person who is a user of this account and has passed person ID.
  // The staging-only UK student pilot keeps its existing exemption.
  const sessionUserId = (session.user as any).id as string | undefined;
  const requestedResponsible = typeof body.responsibleUserId === "string" ? body.responsibleUserId.trim() : sessionUserId ?? "";
  const stagingPilotQa = isStagingPilotQaAccount(account);
  if (!stagingPilotQa && !account.phoneVerifiedAt) {
    return NextResponse.json({ error: "Verify your mobile number with a one-time code before submitting company details." }, { status: 409 });
  }
  const responsibleUser = requestedResponsible
    ? await prisma.user.findFirst({ where: { id: requestedResponsible, accountId }, select: { id: true, accountId: true, personVerifiedAt: true } })
    : null;
  const decision = decideCompanySubmission({
    companyVerificationStatus: account.companyVerificationStatus,
    current: { companyName: account.companyName, companyNumber: account.companyNumber, responsibleUserId: account.companyResponsibleUserId },
    next: { companyName, companyNumber: companyNumber || null },
    responsibleUser: stagingPilotQa && responsibleUser ? { ...responsibleUser, personVerifiedAt: responsibleUser.personVerifiedAt ?? new Date(0) } : responsibleUser,
    accountId,
  });
  if (decision.kind === "reject") return NextResponse.json({ error: decision.error }, { status: decision.status });
  const responsibleUserId = responsibleUser!.id;

  // Same company, different responsible person: free; the company stays verified.
  if (decision.kind === "responsible_person_change") {
    const changed = await prisma.account.update({
      where: { id: accountId },
      data: { companyResponsibleUserId: responsibleUserId },
      select: { companyName: true, companyNumber: true, isSoleTrader: true, companyVerificationStatus: true, companyResponsibleUserId: true },
    });
    return NextResponse.json({ success: true, company: changed, feeMinorUnits: 0 });
  }

  const updated = await prisma.$transaction(async (tx) => {
    let feeMinorUnits = 0;
    // A new company relationship is re-reviewed and charged (one pending record).
    if (decision.kind === "new_company_relationship") {
      const fee = await recordVerificationFee(tx as never, {
        accountId, country: account.country, currency: account.currency,
        action: "new_company_relationship",
        lines: verificationPathFeeLines("poster"),
        idempotencyKey: `company-relationship:${accountId}:${account.companyVerifiedAt?.toISOString() ?? "none"}`,
      });
      feeMinorUnits = fee?.record.amountMinorUnits ?? 0;
    }
    const company = await tx.account.update({
      where: { id: accountId },
      data: {
        companyName,
        companyNumber: companyNumber || null,
        isSoleTrader,
        companyResponsibleUserId: responsibleUserId,
        companyVerificationStatus: "pending",
        companyVerificationSubmittedAt: new Date(),
        companyVerifiedAt: null,
      },
      select: { companyName: true, companyNumber: true, isSoleTrader: true, companyVerificationStatus: true, companyVerificationSubmittedAt: true, companyResponsibleUserId: true },
    });
    return { ...company, feeMinorUnits };
  });
  return NextResponse.json({ success: true, company: updated }, { status: 202 });
}

export const POST = withApiMetrics("/api/company-verification", POSTHandler);
