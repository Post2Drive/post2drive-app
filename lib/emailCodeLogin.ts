import { prisma } from "@/lib/prisma";
import { deliverTransactionalEmail } from "@/lib/emailProvider";

/**
 * Passwordless sign-in by emailed six-digit code. The code lifecycle (hashed
 * at rest, 5-minute expiry, 5 attempts, resend cooldown, atomic single use) is
 * the same one used for text codes in lib/providerLifecycle.ts; the challenge
 * is keyed by a namespaced email so it can never collide with a phone number.
 */
const MAX_EMAIL_LENGTH = 254;

export function normalizeLoginEmail(input: unknown): string | null {
  if (typeof input !== "string") return null;
  const email = input.trim().toLowerCase();
  if (!email || email.length > MAX_EMAIL_LENGTH || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return null;
  return email;
}

/** Identifier stored (hashed) for the challenge. The prefix keeps it apart from phone challenges. */
export function emailCodeKey(email: string): string {
  return `email-code:${email}`;
}

/** The single, not-pending-deletion user who owns this email, or null. */
export async function findUserByLoginEmail(email: string) {
  return prisma.user.findFirst({
    where: { email, account: { deletionRequestedAt: null } },
    include: { account: { include: { qaTestAccounts: { select: { runId: true } } } } },
  });
}

export async function sendSignInCodeEmail(email: string, name: string, code: string, expiresInMinutes: number) {
  const greeting = (name || "there").replace(/[<>&"']/g, "");
  return deliverTransactionalEmail({
    to: email,
    subject: "Your Post2Drive sign-in code",
    text: `Hello ${greeting},\n\nYour Post2Drive sign-in code is ${code}. It expires in ${expiresInMinutes} minutes and works once.\n\nIf you did not ask to sign in, ignore this email and nobody can sign in without the code. Never share it.`,
    html: `<div style="font-family:Arial,sans-serif;line-height:1.6;color:#172033;max-width:600px;margin:auto"><h1 style="font-size:22px">Your sign-in code</h1><p>Hello ${greeting},</p><p style="font-size:32px;letter-spacing:6px;font-weight:700">${code}</p><p>It expires in ${expiresInMinutes} minutes and works once. If you did not ask to sign in, ignore this email. Never share this code.</p></div>`,
  });
}
