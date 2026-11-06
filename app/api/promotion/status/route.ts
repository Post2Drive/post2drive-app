import { withApiMetrics } from "@/lib/apiMetrics";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getEntitlementStatus } from "@/lib/access";
import { getPlanDisplay, isWeeklyPricingEligible } from "@/lib/pricing";
import { prisma } from "@/lib/prisma";
import { isUkAccount } from "@/lib/uk";

/**
 * Launch-window status (replaces the per-account promotion and trial cycles, 2026-11-06).
 * Window dates come from LaunchConfig; when it is missing the response says so instead of
 * inventing dates (`launch.configured: false`).
 */
async function GETHandler() {
  const session =
    await getServerSession(authOptions);

  if (!session) {
    return NextResponse.json(
      { error: "Not logged in." },
      { status: 401 }
    );
  }

  const accountId =
    (session.user as any)?.accountId;

  if (!accountId) {
    return NextResponse.json(
      { error: "Account not found." },
      { status: 404 }
    );
  }

  const account =
    await prisma.account.findUnique({
      where: { id: accountId },
      select: {
        id: true,
        country: true,
        currency: true,
        planType: true,
        fleetVehicleCount: true,
        verificationStatus: true,
        isTester: true,
        subscriptionStatus: true,
        subscriptionPlanKey: true,
      },
    });

  if (!account) {
    return NextResponse.json(
      { error: "Account not found." },
      { status: 404 }
    );
  }

  const ukEligible = isUkAccount(account);
  const status = await getEntitlementStatus(account.id);
  const billingPlan = status.billing?.plan;
  const planKey =
    billingPlan === "poster" || billingPlan === "individual" || billingPlan === "fleet"
      ? billingPlan
      : account.planType === "fleet"
      ? "fleet"
      : "individual";
  const plan = getPlanDisplay(planKey, account);
  const posterPlan = getPlanDisplay("poster", account);

  return NextResponse.json({
    launch: status.launch,
    entitlements: {
      post: { allowed: status.post.allowed, reason: status.post.reason, endsAt: status.post.endsAt ?? null, opensAt: status.post.opensAt },
      drive: { allowed: status.drive.allowed, reason: status.drive.reason, endsAt: status.drive.endsAt ?? null, opensAt: status.drive.opensAt, waitlistPosition: status.drive.waitlistPosition },
    },
    billing: status.billing,
    account: {
      country: account.country,
      currency: account.currency,
      ukLaunchEligible: ukEligible,
      planType: account.planType,
      verificationStatus: account.verificationStatus,
      isTester: account.isTester,
      subscriptionStatus: account.subscriptionStatus,
    },
    paidPlan:
      isWeeklyPricingEligible(account)
        ? {
            key: plan.key,
            name: plan.name,
            price: plan.price,
            currency: plan.currency,
            description: plan.description,
          }
        : null,
    posterPlan:
      isWeeklyPricingEligible(account)
        ? { key: posterPlan.key, name: posterPlan.name, price: posterPlan.price, currency: posterPlan.currency, description: posterPlan.description }
        : null,
  });
}
export const GET = withApiMetrics("/api/promotion/status", GETHandler);
