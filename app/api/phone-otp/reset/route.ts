import bcrypt from "bcryptjs";
import { NextResponse } from "next/server";
import { withApiMetrics } from "@/lib/apiMetrics";
import { enforceRateLimit } from "@/lib/rateLimit";
import { readBoundedJson } from "@/lib/requestBody";
import { verifyOtp } from "@/lib/providerLifecycle";
import { PrismaOtpStore, otpPepper } from "@/lib/otpStore";
import { findIndiaUserByPhone } from "@/lib/phoneLogin";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

const INVALID = { error: "That code is wrong or has expired. Check it, or send a new one.", code: "OTP_INVALID" };

/** Public: set a new password using a text code (India accounts without email). */
async function POSTHandler(request: Request) {
  const body = await readBoundedJson(request, 4096);
  const value = (body.ok ? body.value : {}) as { phone?: unknown; code?: unknown; password?: unknown };
  const code = typeof value.code === "string" ? value.code.replace(/\s/g, "") : "";
  const password = typeof value.password === "string" ? value.password : "";
  if (password.length < 8 || password.length > 128 || Buffer.byteLength(password, "utf8") > 72) {
    return NextResponse.json({ error: "Passwords must be 8–72 UTF-8 bytes (and no more than 128 characters).", code: "PASSWORD_INVALID" }, { status: 400 });
  }

  const { e164, user } = await findIndiaUserByPhone(value.phone);
  const networkLimited = await enforceRateLimit(request, { scope: "phone-otp-reset-network", limit: 20, windowMs: 15 * 60 * 1000 });
  if (networkLimited) return networkLimited;
  const phoneLimited = await enforceRateLimit(request, { scope: "phone-otp-reset-number", identity: e164 ?? "invalid", limit: 10, windowMs: 15 * 60 * 1000 });
  if (phoneLimited) return phoneLimited;

  const pepper = otpPepper();
  if (!e164 || !user || !pepper || !/^\d{6}$/.test(code)) return NextResponse.json(INVALID, { status: 400 });
  const ok = await verifyOtp(e164, code, new PrismaOtpStore(user.accountId), { pepper });
  if (!ok) return NextResponse.json(INVALID, { status: 400 });

  const passwordHash = await bcrypt.hash(password, 10);
  await prisma.$transaction([
    // New password and a bumped session version: every existing session signs out.
    prisma.user.update({ where: { id: user.id }, data: { passwordHash, passwordChangedAt: new Date(), sessionVersion: { increment: 1 } } }),
    prisma.passwordResetToken.deleteMany({ where: { userId: user.id } }),
    ...(user.account.phoneVerifiedAt ? [] : [prisma.account.update({ where: { id: user.accountId }, data: { phoneVerifiedAt: new Date() } })]),
  ]);
  return NextResponse.json({ reset: true });
}

export const POST = withApiMetrics("/api/phone-otp/reset", POSTHandler);
