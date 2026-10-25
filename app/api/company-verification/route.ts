import { withApiMetrics } from "@/lib/apiMetrics";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

// Submit business details for human review. This endpoint never self-approves a business.
async function POSTHandler(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Not logged in." }, { status: 401 });

  const accountId = (session.user as any).accountId as string | undefined;
  if (!accountId) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  let body: unknown;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Business details are required." }, { status: 400 });
  }

  const input = body as { companyName?: unknown; companyNumber?: unknown; isSoleTrader?: unknown };
  const companyName = typeof input.companyName === "string" ? input.companyName.trim() : "";
  const companyNumber = typeof input.companyNumber === "string" ? input.companyNumber.trim() : "";
  const isSoleTrader = input.isSoleTrader === true;

  if (companyName.length < 2 || companyName.length > 160) {
    return NextResponse.json({ error: "Enter a business or trading name between 2 and 160 characters." }, { status: 400 });
  }
  if (!isSoleTrader && (companyNumber.length < 2 || companyNumber.length > 80)) {
    return NextResponse.json({ error: "A company or business registration number is required for registered businesses." }, { status: 400 });
  }

  const account = await prisma.account.findUnique({
    where: { id: accountId },
    select: { verificationStatus: true },
  });
  if (!account) return NextResponse.json({ error: "Account not found." }, { status: 404 });
  if (account.verificationStatus !== "verified") {
    return NextResponse.json({ error: "Verify your account before submitting company details." }, { status: 403 });
  }

  const updated = await prisma.account.update({
    where: { id: accountId },
    data: {
      companyName,
      companyNumber: companyNumber || null,
      isSoleTrader,
      companyVerificationStatus: "pending",
      companyVerificationSubmittedAt: new Date(),
      companyVerifiedAt: null,
    },
    select: { companyName: true, companyNumber: true, isSoleTrader: true, companyVerificationStatus: true, companyVerificationSubmittedAt: true },
  });

  return NextResponse.json({
    success: true,
    companyVerification: updated,
    message: "Business details submitted for review. Posting jobs and participating as a carrier remain locked until company verification is approved.",
  }, { status: 202 });
}

export const POST = withApiMetrics("/api/company-verification", POSTHandler);
