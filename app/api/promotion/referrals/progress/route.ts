import { withApiMetrics } from "@/lib/apiMetrics";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { getReferralProgress } from "@/lib/referrals";
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

  // Referrals are recorded for transparency only. Since the launch-window change (2026-11-06)
  // they no longer extend free time; there are no referral targets.
  const lifetimeProgress = await getReferralProgress(accountId);

  return NextResponse.json({
    ukEligible: true,
    referralCode: account.displayId,
    extendsFreeTime: false,
    lifetimeProgress: {
      verifiedReferrals: lifetimeProgress.verifiedReferrals,
      completedReferredJobs: lifetimeProgress.completedReferrals,
    },
  });
}
export const GET = withApiMetrics("/api/promotion/referrals/progress", GETHandler);
