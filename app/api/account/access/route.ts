import { withApiMetrics } from "@/lib/apiMetrics";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getAccountAccess } from "@/lib/access";
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
  const access = await getAccountAccess(accountId);

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

  const verifiedVehicle = await prisma.vehicle.findFirst({
    where: { accountId, verificationStatus: "verified" },
    select: { id: true },
  });
  const keepCurrentMonthlyPlan = access.account.subscriptionPlanKey === "poster-monthly" &&
    access.account.subscriptionStatus === "active" &&
    Boolean(access.account.subscriptionEndsAt && access.account.subscriptionEndsAt > new Date());
  const pricingAccount = {
    ...access.account,
    type: keepCurrentMonthlyPlan ? "poster" : access.account.type,
    hasVerifiedVehicle: Boolean(verifiedVehicle),
  };
  const priceMinorUnits = getPaidPriceMinorUnits(pricingAccount);
  const market = marketForAccount(access.account);
  const price = priceMinorUnits === null ? null : minorUnitsToMajorUnits(priceMinorUnits, access.account.currency);

  return NextResponse.json({
    allowed: access.allowed,
    reason: access.reason,
    planType: access.account.planType,
    fleetVehicleCount: access.account.fleetVehicleCount,
    verificationStatus: access.account.verificationStatus,
    companyVerificationStatus: access.account.companyVerificationStatus,
    accountType: access.account.type,
    hasVerifiedVehicle: Boolean(verifiedVehicle),
    billingCadence: keepCurrentMonthlyPlan || (!verifiedVehicle && (access.account.type === "poster" || access.account.type === "both")) ? "monthly" : "weekly",
    isTester: access.account.isTester,
    trialStartedAt: access.account.trialStartedAt,
    trialEndsAt: access.account.trialEndsAt,
    freeEndsAt: access.account.freeEndsAt,
    subscriptionStatus: access.account.subscriptionStatus,
    subscriptionEndsAt: access.account.subscriptionEndsAt,
    subscriptionPlanKey: access.account.subscriptionPlanKey,
    endsAt: access.endsAt ?? null,
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
