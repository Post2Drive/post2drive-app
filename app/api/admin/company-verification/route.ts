import { withApiMetrics } from "@/lib/apiMetrics";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isTesterAdmin } from "@/lib/testerAdmin";

async function authorizeAdmin() {
  if (await isTesterAdmin()) return null;
  const session = await getServerSession(authOptions);
  return NextResponse.json(
    { error: session ? "Admin access required." : "Not logged in." },
    { status: session ? 403 : 401 },
  );
}

async function GETHandler() {
  const denied = await authorizeAdmin();
  if (denied) return denied;

  const applications = await prisma.account.findMany({
    where: { companyVerificationStatus: { in: ["pending", "manual_review"] } },
    orderBy: { companyVerificationSubmittedAt: "asc" },
    select: {
      id: true, companyName: true, companyNumber: true, isSoleTrader: true,
      country: true, currency: true, companyVerificationStatus: true,
      companyVerificationSubmittedAt: true, companyVerifiedAt: true,
      verificationStatus: true,
      users: { select: { name: true, email: true, phone: true }, take: 1 },
    },
  });

  return NextResponse.json({ applications });
}

async function POSTHandler(req: Request) {
  const denied = await authorizeAdmin();
  if (denied) return denied;

  let body: unknown;
  try { body = await req.json(); } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  const input = body as { accountId?: unknown; decision?: unknown };
  const accountId = typeof input.accountId === "string" ? input.accountId.trim() : "";
  const decision = input.decision;
  if (!accountId || !["verified", "failed", "manual_review"].includes(String(decision))) {
    return NextResponse.json({ error: "Provide an account ID and a supported review decision." }, { status: 400 });
  }

  const account = await prisma.account.findUnique({
    where: { id: accountId },
    select: { id: true, companyVerificationStatus: true },
  });
  if (!account) return NextResponse.json({ error: "Account not found." }, { status: 404 });
  if (!["pending", "manual_review"].includes(account.companyVerificationStatus)) {
    return NextResponse.json({ error: "Only pending company verification applications can be reviewed." }, { status: 409 });
  }

  const status = decision as "verified" | "failed" | "manual_review";
  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.account.update({
      where: { id: accountId },
      data: {
        companyVerificationStatus: status,
        companyVerifiedAt: status === "verified" ? new Date() : null,
      },
      select: { id: true, companyName: true, companyVerificationStatus: true, companyVerifiedAt: true },
    });
    await tx.adminAuditEvent.create({
      data: {
        actor: "company-verification-reviewer",
        action: "COMPANY_VERIFICATION_REVIEWED",
        entityType: "Account",
        entityId: accountId,
        details: { decision: status },
      },
    });
    return result;
  });

  return NextResponse.json({ success: true, companyVerification: updated });
}

export const GET = withApiMetrics("/api/admin/company-verification", GETHandler);
export const POST = withApiMetrics("/api/admin/company-verification", POSTHandler);
