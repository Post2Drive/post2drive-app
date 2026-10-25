import { withApiMetrics } from "@/lib/apiMetrics";
import { NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { enforceRateLimit } from "@/lib/rateLimit";
import { passwordResetTokenHash } from "@/lib/passwordReset";

async function POSTHandler(req: Request) {
  const limit = await enforceRateLimit(req, {
    scope: "password-reset-complete",
    limit: 10,
    windowMs: 15 * 60 * 1000,
  });
  if (limit) return limit;

  const body = await req.json().catch(() => null);
  const token = typeof body?.token === "string" ? body.token : "";
  const password = typeof body?.password === "string" ? body.password : "";
  if (!token || token.length > 256 || password.length < 8 || password.length > 1024) {
    return NextResponse.json({ success: false, message: "This reset link is invalid or expired. Request a new one." }, { status: 400 });
  }

  const tokenHash = passwordResetTokenHash(token);
  const now = new Date();
  const reset = await prisma.passwordResetToken.findFirst({
    where: { tokenHash, expiresAt: { gt: now }, lastSentAt: { not: null } },
    include: { user: { select: { id: true, accountId: true } } },
  });
  if (!reset) {
    return NextResponse.json({ success: false, message: "This reset link is invalid or expired. Request a new one." }, { status: 400 });
  }

  const passwordHash = await bcrypt.hash(password, 10);
  const changed = await prisma.$transaction(async (tx) => {
    // Share the account-row lifecycle gate with PATCH and DELETE. This makes
    // reset-vs-delete deterministic and prevents a reset restoring deleted PII.
    const gate = await tx.account.updateMany({
      where: { id: reset.user.accountId, deletionRequestedAt: null },
      data: { deletionRequestedAt: null },
    });
    if (gate.count !== 1) return false;

    // Consume the token while holding the account lock so simultaneous reset
    // submissions cannot both succeed with the same link.
    const consumed = await tx.passwordResetToken.deleteMany({
      where: { id: reset.id, tokenHash, expiresAt: { gt: new Date() }, lastSentAt: { not: null } },
    });
    if (consumed.count !== 1) return false;

    const currentUser = await tx.user.findUnique({
      where: { id: reset.user.id },
      select: { passwordChangedAt: true },
    });
    if (!currentUser) return false;
    const changedAt = new Date(Math.max(Date.now(), (currentUser.passwordChangedAt?.getTime() ?? 0) + 1));
    await tx.user.update({
      where: { id: reset.user.id },
      data: { passwordHash, passwordChangedAt: changedAt, sessionVersion: { increment: 1 } },
    });
    // One reset invalidates every other outstanding reset link for this user.
    await tx.passwordResetToken.deleteMany({ where: { userId: reset.user.id } });
    return true;
  });

  if (!changed) {
    return NextResponse.json({ success: false, message: "This reset link is invalid or expired. Request a new one." }, { status: 400 });
  }
  return NextResponse.json({ success: true, message: "Your password has been reset. Please log in with your new password." });
}

export const POST = withApiMetrics("/api/auth/reset-password", POSTHandler);
