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
      companyVerificationSubmittedAt: true, companyReviewCyclePosition: true, companyCorrectionDeadline: true,
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
    reviewCyclePosition: account.companyReviewCyclePosition,
    correctionDeadline: account.companyCorrectionDeadline,
    now: new Date(),
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

  // Charged: a new company relationship, or a resubmission after the free correction
  // windows closed (or for a different company). Corrections inside a window are free.
  const charged = decision.kind === "new_company_relationship" ||
    (decision.kind === "new_attempt_after_failure" && !stagingPilotQa);
  const nextCyclePosition = decision.kind === "correction" ? decision.cyclePosition
    : decision.kind === "in_review_update" ? account.companyReviewCyclePosition : 1;
  const snapshotSubmittedAt = account.companyVerificationSubmittedAt?.getTime() ?? null;

  let updated;
  try {
    updated = await prisma.$transaction(async (tx) => {
      // Serialize concurrent submissions: the state the decision was made on must
      // still hold, otherwise the later request gets a clean 409 (never a 500).
      await tx.$queryRawUnsafe('SELECT "id" FROM "Account" WHERE "id" = $1 FOR UPDATE', accountId);
      const locked = await tx.account.findUnique({
        where: { id: accountId },
        select: { companyVerificationStatus: true, companyVerificationSubmittedAt: true },
      });
      if (!locked || locked.companyVerificationStatus !== account.companyVerificationStatus ||
          (locked.companyVerificationSubmittedAt?.getTime() ?? null) !== snapshotSubmittedAt) {
        throw new Error("COMPANY_SUBMISSION_CONFLICT");
      }
      let feeMinorUnits = 0;
      if (charged) {
        const fee = await recordVerificationFee(tx as never, {
          accountId, country: account.country, currency: account.currency,
          action: decision.kind === "new_company_relationship" ? "new_company_relationship" : "company_reverification",
          lines: verificationPathFeeLines("poster"),
          idempotencyKey: decision.kind === "new_company_relationship"
            ? `company-relationship:${accountId}:${account.companyVerifiedAt?.toISOString() ?? "none"}`
            : `company-reattempt:${accountId}:${account.companyVerificationSubmittedAt?.toISOString() ?? "none"}`,
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
          companyReviewCyclePosition: nextCyclePosition,
          companyCorrectionDeadline: null,
        },
        select: { companyName: true, companyNumber: true, isSoleTrader: true, companyVerificationStatus: true, companyVerificationSubmittedAt: true, companyResponsibleUserId: true },
      });
      return { ...company, feeMinorUnits };
    });
  } catch (error) {
    const prismaCode = (error as { code?: unknown } | null)?.code;
    if ((error instanceof Error && error.message === "COMPANY_SUBMISSION_CONFLICT") || prismaCode === "P2002") {
      return NextResponse.json({ error: "Another company submission for this account was just processed. Refresh and check its status." }, { status: 409 });
    }
    throw error;
  }
  return NextResponse.json({ success: true, company: updated }, { status: 202 });
}

export const POST = withApiMetrics("/api/company-verification", POSTHandler);
