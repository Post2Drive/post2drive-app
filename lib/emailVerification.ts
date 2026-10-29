import { createHash, randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";

const TOKEN_LIFETIME_MS = 24 * 60 * 60 * 1000;

export function emailVerificationEnabled() {
  return process.env.EMAIL_VERIFICATION_ENABLED?.trim().toLowerCase() === "true";
}

/** India is the sole market where email is optional and must not gate access. */
export function emailVerificationRequiredForCountry(country: unknown) {
  return country !== "IN" && emailVerificationEnabled();
}

export function emailDeliveryConfigured() {
  return Boolean(
    process.env.RESEND_API_KEY?.trim() &&
    process.env.EMAIL_FROM?.trim() &&
    process.env.NEXTAUTH_URL?.trim()
  );
}

export async function createEmailVerificationToken(userId: string) {
  const token = randomBytes(32).toString("hex");
  const tokenHash = createHash("sha256").update(token).digest("hex");
  const expiresAt = new Date(Date.now() + TOKEN_LIFETIME_MS);

  // Resending invalidates earlier unused links for the same user.
  await prisma.emailVerificationToken.updateMany({
    where: { userId, usedAt: null },
    data: { usedAt: new Date() },
  });

  await prisma.emailVerificationToken.create({
    data: { userId, tokenHash, expiresAt },
  });

  return { token, expiresAt };
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#39;",
    };
    return entities[character] ?? character;
  });
}

export async function sendVerificationEmail(email: string, name: string, token: string) {
  const configuredBaseUrl = process.env.NEXTAUTH_URL?.trim();
  const baseUrl = (configuredBaseUrl || "").replace(/\/+$/, "");

  if (!baseUrl) {
    throw new Error("Email delivery is not configured.");
  }

  const verificationUrl = `${baseUrl}/verify-email?token=${encodeURIComponent(token)}`;
  const greeting = escapeHtml(name || "there");
  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.6;color:#172033;max-width:600px;margin:auto">
      <h1 style="font-size:24px">Verify your Post2Drive email</h1>
      <p>Hello ${greeting},</p>
      <p>Confirm this email address to finish setting up your Post2Drive account.</p>
      <p><a href="${verificationUrl}" style="display:inline-block;background:#175cd3;color:#fff;text-decoration:none;padding:12px 18px;border-radius:8px">Verify email address</a></p>
      <p>This link expires in 24 hours and can only be used once. If you did not create a Post2Drive account, you can ignore this message.</p>
      <p style="color:#667085;font-size:12px">If the button does not work, copy this address into your browser:<br><a href="${verificationUrl}">${verificationUrl}</a></p>
    </div>
  `;

  const { deliverTransactionalEmail } = await import("@/lib/emailProvider");
  const result = await deliverTransactionalEmail({
    to: email,
    subject: "Verify your Post2Drive email",
    html,
    text: `Hello ${name || "there"},\n\nVerify your Post2Drive email using this link:\n${verificationUrl}\n\nThis link expires in 24 hours and can only be used once. If you did not create an account, ignore this email.`,
  });
  if (!result.accepted) {
    throw new Error(result.reason === "not_configured"
      ? "Email delivery is not configured."
      : "Could not send verification email.");
  }

  await prisma.emailVerificationToken.updateMany({
    where: { tokenHash: hashEmailVerificationToken(token), usedAt: null },
    data: { lastSentAt: new Date() },
  });
}

export function hashEmailVerificationToken(token: string) {
  return createHash("sha256").update(token).digest("hex");
}
