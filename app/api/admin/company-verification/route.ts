import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { isTesterAdmin } from "@/lib/testerAdmin";
import { prisma } from "@/lib/prisma";
import { readBoundedJson } from "@/lib/requestBody";
import { withApiMetrics } from "@/lib/apiMetrics";

async function GETHandler() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Not logged in." }, { status: 401 });
  if (!(await isTesterAdmin())) return NextResponse.json({ error: "Administrator access required." }, { status: 403 });

  const companies = await prisma.account.findMany({
    where: { companyVerificationStatus: { in: ["pending", "manual_review"] } },
    select: {
      id: true, companyName: true, companyNumber: true, isSoleTrader: true,
      country: true, currency: true, verificationStatus: true,
      companyVerificationStatus: true, companyVerificationSubmittedAt: true,
    },
    orderBy: { companyVerificationSubmittedAt: "asc" },
    take: 200,
  });
  return NextResponse.json({ companies });
}

async function POSTHandler(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Not logged in." }, { status: 401 });
  if (!(await isTesterAdmin())) return NextResponse.json({ error: "Administrator access required." }, { status: 403 });

  const parsed = await readBoundedJson(req, 8 * 1024);
  if (!parsed.ok) return NextResponse.json({ error: parsed.status === 413 ? "Request body is too large." : "Invalid request body." }, { status: parsed.status });
  if (!parsed.value || typeof parsed.value !== "object" || Array.isArray(parsed.value)) {
    return NextResponse.json({ error: "Provide an account ID and review decision." }, { status: 400 });
  }
  const body = parsed.value as Record<string, unknown>;
  const accountId = typeof body.accountId === "string" ? body.accountId.trim() : "";
  const decision = body.decision;
  const notes = typeof body.notes === "string" ? body.notes.trim().slice(0, 1000) : "";
  if (!accountId || !["verified", "failed", "manual_review"].includes(String(decision))) {
    return NextResponse.json({ error: "Invalid account ID or decision." }, { status: 400 });
  }

  const account = await prisma.account.findUnique({
    where: { id: accountId },
    select: { id: true, companyVerificationStatus: true, country: true },
  });
  if (!account) return NextResponse.json({ error: "Account not found." }, { status: 404 });
  if (!["pending", "manual_review"].includes(account.companyVerificationStatus)) {
    return NextResponse.json({ error: "Only pending company verification submissions can be reviewed." }, { status: 409 });
  }

  const status = decision as "verified" | "failed" | "manual_review";
  const reviewer = session.user?.email?.trim().toLowerCase() || "admin";
  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.account.update({
      where: { id: accountId },
      data: {
        companyVerificationStatus: status,
        companyVerifiedAt: status === "verified" ? new Date() : null,
      },
      select: { id: true, companyName: true, companyVerificationStatus: true, companyVerificationSubmittedAt: true, companyVerifiedAt: true },
    });
    await tx.adminAuditEvent.create({
      data: {
        actor: reviewer,
        action: "COMPANY_VERIFICATION_REVIEWED",
        entityType: "Account",
        entityId: accountId,
        market: account.country,
        details: { decision: status, notes: notes || null },
      },
    });
    return result;
  });
  return NextResponse.json({ success: true, company: updated });
}

export const GET = withApiMetrics("/api/admin/company-verification", GETHandler);
export const POST = withApiMetrics("/api/admin/company-verification", POSTHandler);
