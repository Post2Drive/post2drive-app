import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { isSupportedMarket, marketTimeZone, sameMarket } from "@/lib/market";
import { getSuspendedAccountAccess } from "@/lib/accessPolicy";

export type JobMarketCheck =
  | { ok: true; country: string; currency: string; timeZone: string }
  | { ok: false; status: 403 | 404; code: string; error: string };

/** Enforce the poster's market boundary on every job-specific API action. */
export async function checkJobMarket(accountId: string, jobId: string): Promise<JobMarketCheck> {
  const [actor, job] = await Promise.all([
    prisma.account.findUnique({
      where: { id: accountId },
      select: { country: true, currency: true, deletionRequestedAt: true, verificationStatus: true },
    }),
    prisma.job.findUnique({
      where: { id: jobId },
      select: {
        currency: true,
        crossBorder: true,
        poster: { select: { country: true, currency: true } },
      },
    }),
  ]);

  if (!actor || !job) return { ok: false, status: 404, code: "JOB_NOT_FOUND", error: "Job not found." };
  if (getSuspendedAccountAccess(actor)) return { ok: false, status: 403, code: "ACCOUNT_SUSPENDED", error: "This account is suspended and cannot perform marketplace actions." };
  if (actor.deletionRequestedAt) return { ok: false, status: 403, code: "ACCOUNT_DELETION_REQUESTED", error: "This account is pending deletion and cannot perform marketplace actions." };
  if (!isSupportedMarket(actor)) return { ok: false, status: 403, code: "UNSUPPORTED_MARKET", error: "Your account's country and currency are not supported." };
  if (job.crossBorder || !sameMarket(actor, job.poster) || actor.currency !== job.currency) {
    return { ok: false, status: 403, code: "MARKET_MISMATCH", error: "This job is not available in your account's market." };
  }

  const timeZone = marketTimeZone(actor);
  return { ok: true, country: actor.country!, currency: actor.currency!, timeZone };
}

export function jobMarketErrorResponse(check: Exclude<JobMarketCheck, { ok: true }>) {
  return { error: check.error, code: check.code };
}

export async function requireJobMarketAccess(accountId: string, jobId: string): Promise<NextResponse | null> {
  const result = await checkJobMarket(accountId, jobId);
  if (result.ok) return null;
  return NextResponse.json({ error: result.error, code: result.code }, { status: result.status });
}
