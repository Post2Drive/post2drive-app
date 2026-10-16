import { withApiMetrics } from "@/lib/apiMetrics";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { enforceRateLimit } from "@/lib/rateLimit";
import { hashEmailVerificationToken } from "@/lib/emailVerification";

async function POSTHandler(req: Request) {
  const limit = await enforceRateLimit(req, { scope: "email-verification-confirm", limit: 20, windowMs: 15 * 60 * 1000 });
  if (limit) return limit;
  const body = await req.json().catch(() => null);
  const rawToken = typeof body?.token === "string" ? body.token.trim() : "";
  if (!/^[a-f0-9]{64}$/i.test(rawToken)) {
    return NextResponse.json({ error: "That verification link is invalid or incomplete." }, { status: 400 });
  }

  const tokenHash = hashEmailVerificationToken(rawToken);
  const record = await prisma.emailVerificationToken.findUnique({
    where: { tokenHash },
    select: {
      id: true, userId: true, expiresAt: true, usedAt: true,
      user: { select: { emailVerifiedAt: true } },
    },
  });

  if (!record) {
    return NextResponse.json({ error: "That verification link is invalid. Request a new one from the login page." }, { status: 400 });
  }
  if (record.user.emailVerifiedAt) {
    return NextResponse.json({ success: true, alreadyVerified: true });
  }

  const now = new Date();
  if (record.usedAt || record.expiresAt <= now) {
    return NextResponse.json({ error: "That verification link has expired or has already been used. Request a new one from the login page." }, { status: 400 });
  }

  const verified = await prisma.$transaction(async (tx) => {
    const claim = await tx.emailVerificationToken.updateMany({
      where: { id: record.id, usedAt: null, expiresAt: { gt: now } },
      data: { usedAt: now },
    });
    if (claim.count !== 1) return false;

    await tx.user.update({
      where: { id: record.userId },
      data: { emailVerifiedAt: now },
    });

    await tx.emailVerificationToken.updateMany({
      where: { userId: record.userId, usedAt: null },
      data: { usedAt: now },
    });
    return true;
  });

  if (!verified) {
    return NextResponse.json({ error: "That verification link has expired or has already been used. Request a new one from the login page." }, { status: 409 });
  }

  return NextResponse.json({ success: true });
}

export const POST = withApiMetrics("/api/email/verify", POSTHandler);
