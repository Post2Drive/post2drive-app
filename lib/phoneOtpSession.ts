import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { toE164ForMarket } from "@/lib/phoneVerification";

/** Peppers stored OTP hashes; falls back to the auth secret, never to a constant. */
export function otpPepper(): string | null {
  const secret = process.env.POST2DRIVE_OTP_SECRET || process.env.NEXTAUTH_SECRET || "";
  return secret.length >= 32 ? secret : null;
}

/**
 * The phone being verified is always the signed-in user's saved number,
 * read from the database. Clients never choose which number receives a code.
 */
export async function loadPhoneOtpContext() {
  const session = await getServerSession(authOptions);
  const accountId = (session?.user as { accountId?: string } | undefined)?.accountId;
  const userId = (session?.user as { id?: string } | undefined)?.id;
  if (!accountId || !userId) return { ok: false as const, status: 401, error: "Not logged in." };

  const account = await prisma.account.findUnique({
    where: { id: accountId, deletionRequestedAt: null },
    select: { id: true, country: true, phoneVerifiedAt: true, users: { where: { id: userId }, select: { phone: true }, take: 1 } },
  });
  if (!account) return { ok: false as const, status: 401, error: "Not logged in." };

  const phone = toE164ForMarket(account.users[0]?.phone, account.country);
  return { ok: true as const, accountId: account.id, phone, alreadyVerified: Boolean(account.phoneVerifiedAt) };
}
