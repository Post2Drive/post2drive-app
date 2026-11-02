import { NextResponse } from "next/server";
import { withApiMetrics } from "@/lib/apiMetrics";
import { enforceRateLimit } from "@/lib/rateLimit";
import { readBoundedJson } from "@/lib/requestBody";
import { verifyOtp } from "@/lib/providerLifecycle";
import { PrismaOtpStore } from "@/lib/otpStore";
import { loadPhoneOtpContext, otpPepper } from "@/lib/phoneOtpSession";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

async function POSTHandler(request: Request) {
  const context = await loadPhoneOtpContext();
  if (!context.ok) return NextResponse.json({ error: context.error }, { status: context.status });
  if (context.alreadyVerified) return NextResponse.json({ verified: true });
  if (!context.phone) {
    return NextResponse.json({ error: "Add a valid mobile number in Account details first.", code: "PHONE_INVALID" }, { status: 400 });
  }

  const limited = await enforceRateLimit(request, { scope: "phone-otp-verify-account", identity: context.accountId, limit: 10, windowMs: 15 * 60 * 1000 });
  if (limited) return limited;

  const body = await readBoundedJson(request, 1024);
  const code = body.ok && typeof (body.value as { code?: unknown })?.code === "string"
    ? ((body.value as { code: string }).code).replace(/\s/g, "")
    : "";
  const pepper = otpPepper();
  if (!pepper) return NextResponse.json({ error: "Verification isn't available right now.", code: "SMS_NOT_AVAILABLE" }, { status: 503 });

  const ok = await verifyOtp(context.phone, code, new PrismaOtpStore(context.accountId), { pepper });
  if (!ok) {
    return NextResponse.json({ error: "That code is wrong or has expired. Check it, or send a new one.", code: "OTP_INVALID" }, { status: 400 });
  }

  await prisma.account.update({ where: { id: context.accountId }, data: { phoneVerifiedAt: new Date() } });
  return NextResponse.json({ verified: true });
}

export const POST = withApiMetrics("/api/account/phone/verify", POSTHandler);
