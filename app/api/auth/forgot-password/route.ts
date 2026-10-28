import { withApiMetrics } from "@/lib/apiMetrics";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { enforceRateLimit } from "@/lib/rateLimit";
import {
  createPasswordResetToken,
  passwordResetDeliveryConfigured,
  sendPasswordResetEmail,
} from "@/lib/passwordReset";
import { readBoundedJson } from "@/lib/requestBody";

const genericResponse = {
  success: true,
  message: "If an account exists for that email, a password reset link will be sent shortly.",
};

async function POSTHandler(req: Request) {
  const limit = await enforceRateLimit(req, {
    scope: "password-reset-request",
    limit: 5,
    windowMs: 15 * 60 * 1000,
  });
  if (limit) return limit;

  const parsedBody = await readBoundedJson(req, 4 * 1024);
  if (!parsedBody.ok) {
    if (parsedBody.status === 413) {
      return NextResponse.json({ error: "Request body is too large." }, { status: 413 });
    }
    return NextResponse.json(genericResponse);
  }
  const body = parsedBody.value && typeof parsedBody.value === "object" && !Array.isArray(parsedBody.value)
    ? parsedBody.value as Record<string, unknown>
    : {};
  const email = typeof body.email === "string" ? body.email.trim().toLowerCase() : "";
  if (!email || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return NextResponse.json(genericResponse);
  }

  // Keep the response identical for unknown accounts, disabled accounts,
  // rate-limited sends, and delivery failures to avoid account enumeration.
  if (!passwordResetDeliveryConfigured()) return NextResponse.json(genericResponse);

  const user = await prisma.user.findUnique({
    where: { email },
    select: {
      id: true,
      accountId: true,
      email: true,
      name: true,
      account: { select: { deletionRequestedAt: true } },
    },
  });
  if (!user || user.account.deletionRequestedAt) return NextResponse.json(genericResponse);

  let reset: Awaited<ReturnType<typeof createPasswordResetToken>> = null;
  try {
    reset = await createPasswordResetToken(user.id, user.accountId);
    if (!reset) return NextResponse.json(genericResponse);
    await sendPasswordResetEmail(user.email, user.name, reset.token);
  } catch (error) {
    if (reset) {
      await prisma.passwordResetToken.deleteMany({ where: { tokenHash: reset.tokenHash } }).catch(() => {});
    }
    console.error("Unable to process password reset request.");
  }

  return NextResponse.json(genericResponse);
}

export const POST = withApiMetrics("/api/auth/forgot-password", POSTHandler);
