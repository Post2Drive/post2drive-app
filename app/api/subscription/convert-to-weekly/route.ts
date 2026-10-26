import { withApiMetrics } from "@/lib/apiMetrics";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isWeeklyPricingEligible } from "@/lib/pricing";

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

// Convert an already-paid poster subscription to driver access without taking an immediate payment.
// The first weekly renewal date is seven days from conversion. A live payment provider must collect
// the renewal on that date; this endpoint deliberately does not pretend to charge a card.
async function POSTHandler() {
  const session = await getServerSession(authOptions);
  const accountId = session?.user?.accountId;
  if (!accountId) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  const account = await prisma.account.findUnique({
    where: { id: accountId },
    include: { vehicles: { where: { verificationStatus: "verified" }, select: { id: true }, take: 1 } },
  });
  if (!account || account.deletionRequestedAt) return NextResponse.json({ error: "Account not found." }, { status: 404 });
  if (!isWeeklyPricingEligible(account)) return NextResponse.json({ error: "Weekly access is not configured for this market." }, { status: 403 });
  if (account.verificationStatus !== "verified") {
    return NextResponse.json({ error: "Complete account verification before converting to driver access." }, { status: 403 });
  }
  if (account.type !== "both" || account.vehicles.length === 0) {
    return NextResponse.json({ error: "Complete vehicle verification before converting to driver access." }, { status: 403 });
  }

  const now = new Date();
  if (
    account.subscriptionStatus !== "active" ||
    account.subscriptionPlanKey !== "poster-monthly" ||
    !account.subscriptionEndsAt ||
    account.subscriptionEndsAt <= now
  ) {
    return NextResponse.json({ error: "Only an active monthly poster subscription can be converted." }, { status: 409 });
  }

  const planKey = account.planType === "fleet" ? "fleet" : "individual";
  const firstWeeklyRenewalAt = new Date(now.getTime() + WEEK_MS);
  const updated = await prisma.account.updateMany({
    where: {
      id: accountId,
      subscriptionStatus: "active",
      subscriptionPlanKey: "poster-monthly",
      subscriptionEndsAt: { gt: now },
    },
    data: {
      subscriptionPlanKey: planKey,
      subscriptionEndsAt: firstWeeklyRenewalAt,
    },
  });
  if (updated.count !== 1) {
    return NextResponse.json({ error: "Subscription changed concurrently. Refresh and try again." }, { status: 409 });
  }

  return NextResponse.json({
    success: true,
    planKey,
    firstWeeklyRenewalAt: firstWeeklyRenewalAt.toISOString(),
    billingProviderConnected: false,
    message: "Subscription converted. No immediate payment was taken; automatic renewal requires payment-provider integration.",
  });
}

export const POST = withApiMetrics("/api/subscription/convert-to-weekly", POSTHandler);
