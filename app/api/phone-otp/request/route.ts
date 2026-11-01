import { NextResponse } from "next/server";
import { withApiMetrics } from "@/lib/apiMetrics";
import { enforceRateLimit } from "@/lib/rateLimit";
import { readBoundedJson } from "@/lib/requestBody";
import { maskPhone, resolvePhoneRoute } from "@/lib/phoneVerification";
import { getSmsOtpProvider } from "@/lib/smsProvider";
import { issueOtp } from "@/lib/providerLifecycle";
import { PrismaOtpStore, otpPepper } from "@/lib/otpStore";
import { findIndiaUserByPhone } from "@/lib/phoneLogin";

export const dynamic = "force-dynamic";

/**
 * Public: send an India sign-in / reset code. The reply is identical whether
 * or not the number belongs to an account, so it can't be used to discover
 * who is registered. Codes only ever go to a number already on an account.
 */
async function POSTHandler(request: Request) {
  const body = await readBoundedJson(request, 1024);
  const rawPhone = body.ok ? (body.value as { phone?: unknown })?.phone : undefined;
  const { e164, user } = await findIndiaUserByPhone(rawPhone);
  if (!e164) {
    return NextResponse.json({ error: "Enter a valid Indian mobile number.", code: "PHONE_INVALID" }, { status: 400 });
  }

  const networkLimited = await enforceRateLimit(request, { scope: "phone-otp-public-network", limit: 10, windowMs: 60 * 60 * 1000 });
  if (networkLimited) return networkLimited;
  const phoneLimited = await enforceRateLimit(request, { scope: "phone-otp-public-number", identity: e164, limit: 5, windowMs: 60 * 60 * 1000 });
  if (phoneLimited) return phoneLimited;

  const provider = getSmsOtpProvider(resolvePhoneRoute(e164));
  const pepper = otpPepper();
  if (!provider || !pepper) {
    return NextResponse.json({ error: "Text-message codes aren't available yet. Please use your password.", code: "SMS_NOT_AVAILABLE" }, { status: 503 });
  }

  const generic = NextResponse.json({ sent: true, to: maskPhone(e164), testMode: provider.providerId === "sandbox-outbox" });
  if (!user) return generic;

  const issued = await issueOtp(e164, new PrismaOtpStore(user.accountId), { pepper, providerConfigured: true });
  // A cooldown answers exactly like a send, so timing of repeats reveals nothing.
  if (!issued.ok) return generic;
  const delivery = await provider.sendOtp({ toE164: e164, code: issued.codeForDelivery, expiresAt: new Date(issued.challenge.expiresAt) });
  if (!delivery.accepted) {
    return NextResponse.json({ error: "The text message couldn't be sent. Please try again shortly.", code: "SMS_SEND_FAILED" }, { status: 502 });
  }
  return generic;
}

export const POST = withApiMetrics("/api/phone-otp/request", POSTHandler);
