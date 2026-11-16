import { NextResponse } from "next/server";
import { withApiMetrics } from "@/lib/apiMetrics";
import { enforceRateLimit } from "@/lib/rateLimit";
import { readBoundedJson } from "@/lib/requestBody";
import { issueOtp, OTP_TTL_MS } from "@/lib/providerLifecycle";
import { PrismaOtpStore, otpPepper } from "@/lib/otpStore";
import { getTransactionalEmailProvider } from "@/lib/emailProvider";
import { emailCodeKey, findUserByLoginEmail, normalizeLoginEmail, sendSignInCodeEmail } from "@/lib/emailCodeLogin";

export const dynamic = "force-dynamic";

/**
 * Public: email a six-digit sign-in code. The reply is identical whether or
 * not the address belongs to an account (cooldown included), so it can't be
 * used to discover who is registered. Codes only go to an address already on
 * an account. Fails closed (503) when email delivery isn't configured.
 */
async function POSTHandler(request: Request) {
  const body = await readBoundedJson(request, 1024);
  const email = body.ok ? normalizeLoginEmail((body.value as { email?: unknown })?.email) : null;
  if (!email) {
    return NextResponse.json({ error: "Enter a valid email address.", code: "EMAIL_INVALID" }, { status: 400 });
  }

  const networkLimited = await enforceRateLimit(request, { scope: "email-code-public-network", limit: 10, windowMs: 60 * 60 * 1000 });
  if (networkLimited) return networkLimited;
  const emailLimited = await enforceRateLimit(request, { scope: "email-code-public-address", identity: email, limit: 5, windowMs: 60 * 60 * 1000 });
  if (emailLimited) return emailLimited;

  const pepper = otpPepper();
  if (!getTransactionalEmailProvider() || !pepper) {
    return NextResponse.json({ error: "Emailed codes aren't available yet. Please use your password.", code: "EMAIL_NOT_AVAILABLE" }, { status: 503 });
  }

  const generic = NextResponse.json({ sent: true });
  const user = await findUserByLoginEmail(email);
  if (!user) return generic;

  const issued = await issueOtp(emailCodeKey(email), new PrismaOtpStore(user.accountId), { pepper, providerConfigured: true });
  // A cooldown answers exactly like a send, so repeats reveal nothing.
  if (!issued.ok) return generic;
  const delivery = await sendSignInCodeEmail(email, user.name, issued.codeForDelivery, Math.round(OTP_TTL_MS / 60000));
  if (!delivery.accepted) {
    return NextResponse.json({ error: "The email couldn't be sent. Please try again shortly.", code: "EMAIL_SEND_FAILED" }, { status: 502 });
  }
  return generic;
}

export const POST = withApiMetrics("/api/email-code/request", POSTHandler);
