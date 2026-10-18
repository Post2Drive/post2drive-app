import { withApiMetrics } from "@/lib/apiMetrics";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import {
  getPromotion,
  getMaximumExtensionCount,
} from "@/lib/promotion";
import { getTrialCycleStatus } from "@/lib/trialCycles";
import { getPlanDisplay, isWeeklyPricingEligible } from "@/lib/pricing";
import { prisma } from "@/lib/prisma";
import { isUkAccount } from "@/lib/uk";

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
      where: {
        id: accountId,
      },
    });

  if (!account) {
    return NextResponse.json(
      { error: "Account not found." },
      { status: 404 }
    );
  }

  const promotion =
    await getPromotion();

  const ukEligible =
    isUkAccount(account);

  // Keep launch-promotion eligibility GB-only, but expose the paid plan to
  // every supported non-India market that uses weekly pricing.

  const planKey =
    account.subscriptionPlanKey ===
      "fleet" ||
    account.subscriptionPlanKey ===
      "individual"
      ? account.subscriptionPlanKey
      : account.planType ===
        "fleet"
      ? "fleet"
      : "individual";

  const plan =
    getPlanDisplay(
      planKey,
      account
    );

  const trialCycle =
    ukEligible && account.promotionParticipant && account.trialStartedAt
      ? await getTrialCycleStatus(account.id)
      : null;

  return NextResponse.json({
    promotion: {
      active:
        ukEligible &&
        promotion.active,

      startAt:
        ukEligible
          ? promotion.startAt
          : null,

      endAt:
        ukEligible
          ? promotion.endAt
          : null,
    },

    account: {
      country:
        account.country,

      currency:
        account.currency,

      ukPromotionEligible:
        ukEligible,

      planType:
        account.planType,

      promotionParticipant:
        ukEligible &&
        account.promotionParticipant,

      verificationStatus:
        account.verificationStatus,

      isTester:
        account.isTester,

      subscriptionStatus:
        account.subscriptionStatus,

      trialStartedAt:
        ukEligible
          ? account.trialStartedAt
          : null,

      trialEndsAt:
        ukEligible
          ? account.trialEndsAt
          : null,

      freeEndsAt:
        ukEligible
          ? account.freeEndsAt
          : null,

      freeMonthsEarned:
        ukEligible
          ? account.freeMonthsEarned
          : 0,

      extensionCount:
        ukEligible
          ? account.extensionCount
          : 0,

      maximumExtensionCount:
        ukEligible
          ? getMaximumExtensionCount(
              account.planType
            )
          : 0,
    },

    trialCycle,
    paidPlan:
      isWeeklyPricingEligible(account)
        ? {
            key: plan.key,
            name: plan.name,
            price: plan.price,
            currency:
              plan.currency,
            description:
              plan.description,
          }
        : null,
  });
}
export const GET = withApiMetrics("/api/promotion/status", GETHandler);
