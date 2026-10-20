import { createHash, randomBytes } from "crypto";
import { prisma } from "@/lib/prisma";

const TOKEN_LIFETIME_MS = 60 * 60 * 1000;
const RESEND_ENDPOINT = "https://api.resend.com/emails";

export function passwordResetTokenHash(token: string) {
  return createHash("sha256").update(token).digest("hex");
}

function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => {
    const entities: Record<string, string> = {
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    };
    return entities[character] ?? character;
  });
}

export function passwordResetDeliveryConfigured() {
  return Boolean(
    process.env.RESEND_API_KEY?.trim() &&
    process.env.EMAIL_FROM?.trim() &&
    process.env.NEXTAUTH_URL?.trim()
  );
}

export async function createPasswordResetToken(userId: string) {
  const cooldownSince = new Date(Date.now() - 60 * 1000);
  const recentlySent = await prisma.passwordResetToken.findFirst({
    where: { userId, lastSentAt: { gt: cooldownSince } },
    select: { id: true },
  });
  if (recentlySent) return null;

  const token = randomBytes(32).toString("hex");
  const tokenHash = passwordResetTokenHash(token);
  const expiresAt = new Date(Date.now() + TOKEN_LIFETIME_MS);

  await prisma.$transaction([
    prisma.passwordResetToken.deleteMany({ where: { userId } }),
    prisma.passwordResetToken.create({ data: { userId, tokenHash, expiresAt } }),
  ]);
  return { token, tokenHash, expiresAt };
}

export async function sendPasswordResetEmail(email: string, name: string, token: string) {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  const from = process.env.EMAIL_FROM?.trim();
  const baseUrl = (process.env.NEXTAUTH_URL?.trim() || "").replace(/\\/+$/, "");
  if (!apiKey || !from || !baseUrl) throw new Error("Password reset email delivery is not configured.");

  const resetUrl = `${baseUrl}/reset-password?token=${encodeURIComponent(token)}`;
  const greeting = escapeHtml(name || "there");
  const html = `
    <div style="font-family:Arial,sans-serif;line-height:1.6;color:#172033;max-width:600px;margin:auto">
      <h1 style="font-size:24px">Reset your Post2Drive password</h1>
      <p>Hello ${greeting},</p>
      <p>We received a request to reset the password for your Post2Drive account.</p>
      <p><a href="${resetUrl}" style="display:inline-block;background:#175cd3;color:#fff;text-decoration:none;padding:12px 18px;border-radius:8px">Reset password</a></p>
      <p>This link expires in one hour and can only be used once. If you did not request a reset, you can ignore this email.</p>
      <p style="color:#667085;font-size:12px">If the button does not work, copy this address into your browser:<br><a href="${resetUrl}">${resetUrl}</a></p>
    </div>
  `;

  const response = await fetch(RESEND_ENDPOINT, {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}`, "Content-Type": "application/json" },
    body: JSON.stringify({
      from, to: [email], subject: "Reset your Post2Drive password", html,
      text: `Hello ${name || "there"},\\n\\nReset your Post2Drive password using this link:\\n${resetUrl}\\n\\nThis link expires in one hour and can only be used once. If you did not request a reset, ignore this email.`,
    }),
  });
  if (!response.ok) {
    const responseText = await response.text().catch(() => "");
    console.error("Password reset email delivery failed:", response.status, responseText.slice(0, 300));
    throw new Error("Could not send password reset email.");
  }

  await prisma.passwordResetToken.updateMany({
    where: { tokenHash, lastSentAt: null },
    data: { lastSentAt: new Date() },
  });
}
