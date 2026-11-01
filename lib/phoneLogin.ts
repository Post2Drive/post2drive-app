import { prisma } from "@/lib/prisma";
import { toE164ForMarket } from "@/lib/phoneVerification";

/**
 * Find the single India user who owns a phone number, whatever format it was
 * typed in. Fails closed (null) when legacy duplicates make it ambiguous,
 * when the account is pending deletion, or when the number isn't valid.
 */
export async function findIndiaUserByPhone(input: unknown) {
  const e164 = toE164ForMarket(input, "IN");
  if (!e164) return { e164: null, user: null } as const;
  const matches = await prisma.user.findMany({
    where: { phoneE164: e164, account: { country: "IN", currency: "INR", deletionRequestedAt: null } },
    include: { account: { include: { qaTestAccounts: { select: { runId: true } } } } },
    take: 2,
  });
  return { e164, user: matches.length === 1 ? matches[0] : null } as const;
}
