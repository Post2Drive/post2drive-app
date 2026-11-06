import { withApiMetrics } from "@/lib/apiMetrics";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { enforceRateLimit } from "@/lib/rateLimit";
import { getEntitlementStatus } from "@/lib/access";

export const dynamic = "force-dynamic";

/*
 * Driver -> poster switch (EXECUTION_PLAN §3). The request takes effect at the end of the current
 * 7-day period (lib/launchWindows.ts driverPlanEndsAt); billing then returns to the poster monthly
 * plan. POST records the request; DELETE cancels it while it has not yet taken effect.
 * Neither method reads a request body.
 */

async function currentAccountId() {
  const session = await getServerSession(authOptions);
  return session?.user?.accountId ?? null;
}

async function POSTHandler(req: Request) {
  const accountId = await currentAccountId();
  if (!accountId) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const limited = await enforceRateLimit(req, { scope: "plan-switch-to-poster", identity: accountId, limit: 10, windowMs: 60 * 60 * 1000 });
  if (limited) return limited;

  const status = await getEntitlementStatus(accountId);
  if (!status.post.account) return NextResponse.json({ error: "Account not found." }, { status: 404 });
  if (status.post.reason === "account_suspended" || status.post.reason === "account_deletion_requested") {
    return NextResponse.json({ error: "This account cannot change plan." }, { status: 403 });
  }
  const billing = status.billing;
  if (!billing || (billing.plan !== "individual" && billing.plan !== "fleet")) {
    return NextResponse.json({ error: "Only an account on a driver or fleet plan can switch to the poster plan." }, { status: 409 });
  }

  const now = new Date();
  // Conditional write: a second request keeps the original request time (idempotent).
  await prisma.account.updateMany({
    where: { id: accountId, deletionRequestedAt: null, switchToPosterRequestedAt: null },
    data: { switchToPosterRequestedAt: now },
  });
  const after = await getEntitlementStatus(accountId);
  return NextResponse.json({
    switchRequested: true,
    effectiveAt: after.billing?.driverPlanEndsAt ?? null,
  }, { headers: { "Cache-Control": "no-store" } });
}

async function DELETEHandler(req: Request) {
  const accountId = await currentAccountId();
  if (!accountId) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const limited = await enforceRateLimit(req, { scope: "plan-switch-to-poster", identity: accountId, limit: 10, windowMs: 60 * 60 * 1000 });
  if (limited) return limited;

  const status = await getEntitlementStatus(accountId);
  const account = status.post.account;
  if (!account) return NextResponse.json({ error: "Account not found." }, { status: 404 });
  if (!account.switchToPosterRequestedAt) {
    return NextResponse.json({ switchRequested: false }, { headers: { "Cache-Control": "no-store" } });
  }
  // Once the switch has taken effect (driverPlanEndsAt passed), it can no longer be cancelled.
  const effectiveAt = status.billing?.driverPlanEndsAt ?? null;
  if (!effectiveAt || effectiveAt <= new Date()) {
    return NextResponse.json({ error: "The switch to the poster plan has already taken effect." }, { status: 409 });
  }
  await prisma.account.updateMany({
    where: { id: accountId, switchToPosterRequestedAt: account.switchToPosterRequestedAt },
    data: { switchToPosterRequestedAt: null },
  });
  return NextResponse.json({ switchRequested: false }, { headers: { "Cache-Control": "no-store" } });
}

export const POST = withApiMetrics("/api/account/plan/switch-to-poster", POSTHandler);
export const DELETE = withApiMetrics("/api/account/plan/switch-to-poster", DELETEHandler);
