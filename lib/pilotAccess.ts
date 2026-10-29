import { createHash, timingSafeEqual } from "node:crypto";
import { prisma } from "@/lib/prisma";
import { isQaRunnerEnabled } from "@/lib/qaRunnerGuard";
import { isUkAccount } from "@/lib/uk";

export const PILOT_ACCESS_CODE_TTL_MS = 14 * 24 * 60 * 60 * 1000;

export function hashPilotAccessCode(code: string): string {
  return createHash("sha256").update(code.trim().toUpperCase()).digest("hex");
}

function equalHash(stored: string, supplied: string): boolean {
  if (!/^[a-f0-9]{64}$/i.test(stored) || !/^[a-f0-9]{64}$/i.test(supplied)) return false;
  const left = Buffer.from(stored, "hex");
  const right = Buffer.from(supplied, "hex");
  return left.length === right.length && left.length > 0 && timingSafeEqual(left, right);
}

/**
 * Reusable cohort codes are accepted only in the explicitly allow-listed
 * staging environment and only for GB/GBP accounts. The database stores only
 * a hash; generating a replacement invalidates the previous code.
 */
export async function validateSharedUkPilotCode(
  rawCode: string,
  market: { country: string; currency: string },
): Promise<boolean> {
  if (!isQaRunnerEnabled() || !isUkAccount(market)) return false;
  const code = rawCode.trim().toUpperCase();
  if (!/^P2D-PILOT-[A-F0-9]{24}$/.test(code)) return false;

  const latest = await prisma.adminAuditEvent.findFirst({
    where: {
      action: "pilot_access_code_generated",
      entityType: "pilot_access_code",
      market: "GB",
    },
    orderBy: { createdAt: "desc" },
    select: { details: true },
  });
  if (!latest?.details || typeof latest.details !== "object" || Array.isArray(latest.details)) return false;
  const details = latest.details as Record<string, unknown>;
  const storedHash = typeof details.codeHash === "string" ? details.codeHash : "";
  const expiresAt = typeof details.expiresAt === "string" ? Date.parse(details.expiresAt) : Number.NaN;
  if (!Number.isFinite(expiresAt) || expiresAt <= Date.now()) return false;
  return equalHash(storedHash, hashPilotAccessCode(code));
}
