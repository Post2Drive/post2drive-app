import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { readBoundedJson } from "@/lib/requestBody";
import { enforceRateLimit } from "@/lib/rateLimit";
import { withApiMetrics } from "@/lib/apiMetrics";

async function POSTHandler(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Not logged in." }, { status: 401 });
  const accountId = (session.user as any).accountId as string | undefined;
  if (!accountId) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

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

  const account = await prisma.account.findUnique({ where: { id: accountId }, select: { companyVerificationStatus: true } });
  if (!account) return NextResponse.json({ error: "Account not found." }, { status: 404 });
  if (account.companyVerificationStatus === "verified") {
    return NextResponse.json({ error: "This company is already verified." }, { status: 409 });
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
  return NextResponse.json({ success: true, company: updated }, { status: 202 });
}

export const POST = withApiMetrics("/api/company-verification", POSTHandler);
