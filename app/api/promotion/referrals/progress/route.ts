import { withApiMetrics } from "@/lib/apiMetrics";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getReferralProgress } from "@/lib/referrals";
import { getTrialCycleStatus } from "@/lib/trialCycles";
import { prisma } from "@/lib/prisma";
import { isUkAccount } from "@/lib/uk";

async function GETHandler() {
  const session =
    await getServerSession(
      authOptions
    );

  if (!session) {
    return NextResponse.json(
      {
        error: "Not logged in.",
      },
      { status: 401 }
    );
  }

  const accountId =
    (session.user as any)
      ?.accountId;

  if (!accountId) {
    return NextResponse.json(
      {
        error:
          "Account not found.",
      },
      { status: 404 }
    );
  }

  const account =
    await prisma.account.findUnique({
      where: {
        id: accountId,
      },
      select: {
        displayId: true,
        country: true,
        currency: true,
        promotionParticipant:
          true,
        extensionCount: true,
        freeEndsAt: true,
      },
    });

  if (!account) {
    return NextResponse.json(
      {
        error:
          "Account not found.",
      },
      { status: 404 }
    );
  }

  const ukEligible =
    isUkAccount(account);

  if (!ukEligible) {
    return NextResponse.json({
      ukEligible: false,
      message:
        "The UK referral programme is only available to GB + GBP accounts.",
    });
  }

  const lifetimeProgress = await getReferralProgress(accountId);
  const trialCycle =
    account.promotionParticipant
      ? await getTrialCycleStatus(accountId)
      : null;
  const cycleProgress = trialCycle?.eligible ? trialCycle.actual : {
    verifiedReferrals: 0,
    completedReferrals: 0,
  };
  const referralTargetsReached =
    cycleProgress.verifiedReferrals >= 15 &&
    cycleProgress.completedReferrals >= 5;

  return NextResponse.json({
    ukEligible: true,
    referralCode: account.displayId,
    promotionParticipant: account.promotionParticipant,
    extensionCount: account.extensionCount,
    maximumExtensions: 3,
    freeEndsAt: account.freeEndsAt,
    required: {
      verifiedReferrals: 15,
      completedReferredJobs: 5,
    },
    // Only referrals created and qualified in the active trial cycle count
    // toward an extension. Lifetime totals remain visible for transparency.
    progress: {
      verifiedReferrals: cycleProgress.verifiedReferrals,
      completedReferredJobs: cycleProgress.completedReferrals,
    },
    lifetimeProgress: {
      verifiedReferrals: lifetimeProgress.verifiedReferrals,
      completedReferredJobs: lifetimeProgress.completedReferrals,
    },
    referralTargetsReached,
    qualified: Boolean(trialCycle?.eligible && trialCycle.qualified),
    trialCycle,
    remaining: {
      verifiedReferrals: Math.max(0, 15 - cycleProgress.verifiedReferrals),
      completedReferredJobs: Math.max(0, 5 - cycleProgress.completedReferrals),
    },
  });
}
export const GET = withApiMetrics("/api/promotion/referrals/progress", GETHandler);
