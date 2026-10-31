import { withApiMetrics } from "@/lib/apiMetrics";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { enforceRateLimit } from "@/lib/rateLimit";
import { readBoundedJson } from "@/lib/requestBody";
import {
  createEmailVerificationToken,
  emailDeliveryConfigured,
  emailVerificationEnabled,
  sendVerificationEmail,
} from "@/lib/emailVerification";

const genericResponse = {
  success: true,
  message: "If that address has an account that needs verification, a link will be sent shortly.",
};

async function POSTHandler(req: Request) {
  const limit = await enforceRateLimit(req, { scope: "email-verification-resend", limit: 5, windowMs: 15 * 60 * 1000 });
  if (limit) return limit;
  if (!emailVerificationEnabled()) {
    return NextResponse.json({
      success: false,
      message: "Email verification is not currently enabled.",
    }, { status: 409 });
  }
  if (!emailDeliveryConfigured()) {
    return NextResponse.json({
      success: false,
      message: "Email delivery is not configured yet. Please contact Post2Drive support.",
    }, { status: 503 });
  }

  const parsedBody = await readBoundedJson(req, 4 * 1024);
  if (!parsedBody.ok) {
    if (parsedBody.status === 413) return NextResponse.json({ error: "Request body is too large." }, { status: 413 });
    return NextResponse.json(genericResponse);
  }
  const body = parsedBody.value && typeof parsedBody.value === "object" && !Array.isArray(parsedBody.value)
    ? parsedBody.value as Record<string, unknown>
    : {};
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json(genericResponse);
  }

  const user = await prisma.user.findUnique({
    where: { email },
    select: { id: true, name: true, email: true, emailVerifiedAt: true },
  });
  if (!user || !user.email || user.emailVerifiedAt) return NextResponse.json(genericResponse);

  const cooldownSince = new Date(Date.now() - 60 * 1000);
  const recentlySent = await prisma.emailVerificationToken.findFirst({
    where: { userId: user.id, usedAt: null, lastSentAt: { gt: cooldownSince } },
    select: { id: true },
  });
  if (recentlySent) return NextResponse.json(genericResponse);

  try {
    const { token } = await createEmailVerificationToken(user.id);
    await sendVerificationEmail(user.email, user.name, token);
  } catch (error) {
    console.error("Unable to resend email verification.", { errorName: error instanceof Error ? error.name : "UnknownError" });
  }

  return NextResponse.json(genericResponse);
}

export const POST = withApiMetrics("/api/email/verification/resend", POSTHandler);
