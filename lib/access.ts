import { prisma } from "@/lib/prisma";
import { isUkAccount } from "@/lib/uk";
import { isWeeklyPricingEligible } from "@/lib/pricing";
import { getTrialCycleStatus } from "@/lib/trialCycles";
import { getSuspendedAccountAccess } from "@/lib/accessPolicy";

export async function getAccountAccess(accountId: string) {
  let account = await prisma.account.findUnique({
    where: { id: accountId },
    select: {
      id: true,
      country: true,
      currency: true,
      verificationStatus: true,
      phoneVerifiedAt: true,
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

  // Suspension is a hard account-wide denial. It must be checked before any
  // market-specific phone, tester, promotion, or subscription exemption.
  const suspensionAccess = getSuspendedAccountAccess(account);
  if (suspensionAccess) return suspensionAccess;

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
        phoneVerifiedAt: true,
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

    // Recheck after the refresh so a suspension committed during trial-cycle
    // evaluation cannot pass through the remaining market-specific branches.
    const refreshedSuspensionAccess = getSuspendedAccountAccess(account);
    if (refreshedSuspensionAccess) return refreshedSuspensionAccess;
  }

  // India has no paid access tier or person/company verification gate.
  // A valid phone OTP is the sole platform-access prerequisite.
  if (account.country === "IN" && account.currency === "INR") {
    if (!account.phoneVerifiedAt) {
      return { allowed: false, reason: "verification_required" as const, account };
    }
    return { allowed: true, reason: "india_free" as const, account };
  }

  if (!isWeeklyPricingEligible(account)) {
    return {
      allowed: true,
      reason: "non_weekly_market" as const,
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
    isUkAccount(account) &&
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
