import { withApiMetrics } from "@/lib/apiMetrics";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getEntitlementStatus } from "@/lib/access";
import { getPaidPriceMinorUnits } from "@/lib/subscription";
import { marketForAccount } from "@/lib/market";
import { minorUnitsToMajorUnits } from "@/lib/currencyMinorUnits";

export const dynamic = "force-dynamic";

async function GETHandler() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.accountId) {
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 }
    );
  }

  const accountId = session.user.accountId;
  const status = await getEntitlementStatus(accountId);
  // "Any access" view kept for existing UI; job actions use the separate POST/DRIVE entitlements below.
  const access = status.post.allowed || !status.drive.allowed ? status.post : status.drive;

  if (!access.account) {
    return NextResponse.json(
      { error: "Account not found." },
      { status: 404 }
    );
  }

  const pendingPayment = await prisma.subscriptionPayment.findFirst({
    where: {
      accountId,
      status: "pending",
    },
    orderBy: {
      createdAt: "desc",
    },
    select: {
      id: true,
      planKey: true,
      amountMinorUnits: true,
      currency: true,
      status: true,
      createdAt: true,
    },
  });

  const priceMinorUnits = getPaidPriceMinorUnits(access.account, status.billing?.plan);
  const market = marketForAccount(access.account);
  const price = priceMinorUnits === null ? null : minorUnitsToMajorUnits(priceMinorUnits, access.account.currency);

  return NextResponse.json({
    allowed: access.allowed,
    reason: access.reason,
    planType: access.account.planType,
    fleetVehicleCount: access.account.fleetVehicleCount,
    verificationStatus: access.account.verificationStatus,
    isTester: access.account.isTester,
    trialStartedAt: access.account.trialStartedAt,
    trialEndsAt: access.account.trialEndsAt,
    freeEndsAt: access.account.freeEndsAt,
    subscriptionStatus: access.account.subscriptionStatus,
    subscriptionEndsAt: access.account.subscriptionEndsAt,
    subscriptionPlanKey: access.account.subscriptionPlanKey,
    endsAt: access.endsAt ?? null,
    opensAt: access.opensAt ?? null,
    post: { allowed: status.post.allowed, reason: status.post.reason, endsAt: status.post.endsAt ?? null, opensAt: status.post.opensAt },
    drive: { allowed: status.drive.allowed, reason: status.drive.reason, endsAt: status.drive.endsAt ?? null, opensAt: status.drive.opensAt, waitlistPosition: status.drive.waitlistPosition },
    launch: status.launch,
    billing: status.billing,
    price,
    currency: access.account.currency,
    marketLabel: market?.label ?? "Marketplace",
    locale: market?.locale ?? "en",
    timeZone: market?.timeZone ?? "UTC",
    priceGbp: access.account.currency === "GBP" ? price : null,
    pendingPayment,
  });
}

export const GET = withApiMetrics("/api/account/access", GETHandler);
