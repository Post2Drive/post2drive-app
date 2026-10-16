import { prisma } from "@/lib/prisma";
import { isUkAccount } from "@/lib/uk";
import { getTrialCycleStatus } from "@/lib/trialCycles";

export async function getAccountAccess(accountId: string) {
  let account = await prisma.account.findUnique({
    where: { id: accountId },
    select: {
      id: true,
      country: true,
      currency: true,
      verificationStatus: true,
      isTester: true,
      promotionParticipant: true,
      trialStartedAt: true,
      trialEndsAt: true,
      freeEndsAt: true,
      subscriptionStatus: true,
      subscriptionEndsAt: true,
      subscriptionPlanKey: true,
      planType: true,
      fleetVehicleCount: true,
      deletionRequestedAt: true,
    },
  });

  if (!account) {
    return {
      allowed: false,
      reason: "account_not_found" as const,
      account: null,
    };
  }

  if (account.deletionRequestedAt) {
    return { allowed: false, reason: "account_deletion_requested" as const, account };
  }

  // When a trial or grace window has expired, evaluate the persisted cycle
  // before denying access. This makes extensions/grace decisions idempotent
  // and ensures access cannot be extended merely by referral counts alone.
  if (
    isUkAccount(account) &&
    account.promotionParticipant &&
    account.trialStartedAt &&
    (account.verificationStatus === "verified" || account.isTester) &&
    (!account.freeEndsAt || account.freeEndsAt <= new Date())
  ) {
    await getTrialCycleStatus(accountId);
    account = await prisma.account.findUnique({
      where: { id: accountId },
      select: {
        id: true,
        country: true,
        currency: true,
        verificationStatus: true,
        isTester: true,
        promotionParticipant: true,
        trialStartedAt: true,
        trialEndsAt: true,
        freeEndsAt: true,
        subscriptionStatus: true,
        subscriptionEndsAt: true,
        subscriptionPlanKey: true,
        planType: true,
        fleetVehicleCount: true,
      deletionRequestedAt: true,
      },
    });
    if (!account) {
      return {
        allowed: false,
        reason: "account_not_found" as const,
        account: null,
      };
    }
  }

  if (!isUkAccount(account)) {
    return {
      allowed: true,
      reason: "non_uk_account" as const,
      account,
    };
  }

  if (account.verificationStatus !== "verified" && !account.isTester) {
    return {
      allowed: false,
      reason: "verification_required" as const,
      account,
    };
  }

  const now = new Date();

  if (
    account.promotionParticipant &&
    account.freeEndsAt &&
    account.freeEndsAt > now
  ) {
    return {
      allowed: true,
      reason: "promotional" as const,
      account,
      endsAt: account.freeEndsAt,
    };
  }

  if (
    account.subscriptionStatus === "active" &&
    account.subscriptionEndsAt &&
    account.subscriptionEndsAt > now
  ) {
    return {
      allowed: true,
      reason: "paid" as const,
      account,
      endsAt: account.subscriptionEndsAt,
    };
  }

  return {
    allowed: false,
    reason: "access_expired" as const,
    account,
  };
}
