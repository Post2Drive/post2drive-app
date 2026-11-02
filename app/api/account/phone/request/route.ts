import { NextResponse } from "next/server";
import { withApiMetrics } from "@/lib/apiMetrics";
import { enforceRateLimit } from "@/lib/rateLimit";
import { resolvePhoneRoute, maskPhone } from "@/lib/phoneVerification";
import { getSmsOtpProvider } from "@/lib/smsProvider";
import { issueOtp, OTP_RESEND_COOLDOWN_MS } from "@/lib/providerLifecycle";
import { PrismaOtpStore } from "@/lib/otpStore";
import { loadPhoneOtpContext, otpPepper } from "@/lib/phoneOtpSession";

export const dynamic = "force-dynamic";

async function POSTHandler(request: Request) {
  const context = await loadPhoneOtpContext();
  if (!context.ok) return NextResponse.json({ error: context.error }, { status: context.status });
  if (context.alreadyVerified) return NextResponse.json({ verified: true });
  if (!context.phone) {
    return NextResponse.json({ error: "Add a valid mobile number in Account details first.", code: "PHONE_INVALID" }, { status: 400 });
  }

  // Limit per network and per account so the endpoint can't be used to send
  // floods of texts.
  const networkLimited = await enforceRateLimit(request, { scope: "phone-otp-request-network", limit: 10, windowMs: 60 * 60 * 1000 });
  if (networkLimited) return networkLimited;
  const accountLimited = await enforceRateLimit(request, { scope: "phone-otp-request-account", identity: context.accountId, limit: 5, windowMs: 60 * 60 * 1000 });
  if (accountLimited) return accountLimited;

  const provider = getSmsOtpProvider(resolvePhoneRoute(context.phone));
  const pepper = otpPepper();
  if (!provider || !pepper) {
    return NextResponse.json({ error: "Text-message codes aren't available yet. Please try again later.", code: "SMS_NOT_AVAILABLE" }, { status: 503 });
  }

  const issued = await issueOtp(context.phone, new PrismaOtpStore(context.accountId), { pepper, providerConfigured: true });
  if (!issued.ok) {
    return NextResponse.json(
      { error: "A code was sent less than a minute ago. Wait a moment before asking for another.", code: "OTP_COOLDOWN", retryAfterSeconds: OTP_RESEND_COOLDOWN_MS / 1000 },
      { status: 429, headers: { "Retry-After": String(OTP_RESEND_COOLDOWN_MS / 1000) } },
    );
  }

  const delivery = await provider.sendOtp({ toE164: context.phone, code: issued.codeForDelivery, expiresAt: new Date(issued.challenge.expiresAt) });
  if (!delivery.accepted) {
    return NextResponse.json({ error: "The text message couldn't be sent. Please try again shortly.", code: "SMS_SEND_FAILED" }, { status: 502 });
  }

  return NextResponse.json({
    sent: true,
    to: maskPhone(context.phone),
    expiresAt: new Date(issued.challenge.expiresAt).toISOString(),
    testMode: provider.providerId === "sandbox-outbox",
  });
}

export const POST = withApiMetrics("/api/account/phone/request", POSTHandler);
