import { prisma } from "@/lib/prisma";
import { OTP_MAX_ATTEMPTS, type OtpChallenge, type OtpChallengeStore } from "@/lib/providerLifecycle";

/**
 * Durable OTP store. `consume` is a single conditional UPDATE, so two
 * concurrent correct submissions can never both succeed.
 */
export class PrismaOtpStore implements OtpChallengeStore {
  constructor(private readonly accountId: string) {}

  async get(phoneHash: string): Promise<OtpChallenge | null> {
    const row = await prisma.phoneOtpChallenge.findUnique({ where: { phoneHash } });
    // A challenge issued to another account (same number saved twice) is
    // invisible here, so guesses can't touch or take it over.
    if (!row || row.accountId !== this.accountId) return null;
    return {
      phoneHash: row.phoneHash,
      codeHash: row.codeHash,
      expiresAt: row.expiresAt.getTime(),
      createdAt: row.createdAt.getTime(),
      attempts: row.attempts,
      consumedAt: row.consumedAt ? row.consumedAt.getTime() : null,
    };
  }

  async put(challenge: OtpChallenge): Promise<void> {
    const data = {
      accountId: this.accountId,
      codeHash: challenge.codeHash,
      expiresAt: new Date(challenge.expiresAt),
      createdAt: new Date(challenge.createdAt),
      attempts: challenge.attempts,
      consumedAt: challenge.consumedAt === null ? null : new Date(challenge.consumedAt),
    };
    await prisma.phoneOtpChallenge.upsert({
      where: { phoneHash: challenge.phoneHash },
      create: { phoneHash: challenge.phoneHash, ...data },
      update: data,
    });
  }

  async consume(phoneHash: string, expectedCodeHash: string, now: number): Promise<boolean> {
    const result = await prisma.phoneOtpChallenge.updateMany({
      where: {
        phoneHash,
        accountId: this.accountId,
        codeHash: expectedCodeHash,
        consumedAt: null,
        expiresAt: { gt: new Date(now) },
        attempts: { lt: OTP_MAX_ATTEMPTS },
      },
      data: { consumedAt: new Date(now) },
    });
    return result.count === 1;
  }
}
