import { prisma } from "@/lib/prisma";
import { isUkAccount } from "@/lib/uk";
import { marketForAccount } from "@/lib/market";
import { isQaRunnerEnabled } from "@/lib/qaRunnerGuard";
import {
  ORDER_BLOCK_MESSAGES,
  decideVerificationStart,
  failureOutcome,
  hasActivePaidPlan,
  verificationFeeTotalMinorUnits,
  verificationOrderBlock,
  verificationPathFeeLines,
  verificationPathForAccountType,
} from "@/lib/verificationProcess";
import { isFeeFreeMarket, recordVerificationFee, uncoveredVehicleIds } from "@/lib/verificationFees";
import {
  startPromotionForVerifiedAccount,
} from "@/lib/promotion";
import { markReferralVerified } from "@/lib/referrals";

/**
 * Fee for starting a verification on this account's path, in currency minor units.
 * Poster path (Step 2: person + company) = VERIFICATION_FEES.personAndCompany.
 * Driver/fleet path (Step 3) = VERIFICATION_FEES.driverAndFirstVehicle plus
 * VERIFICATION_FEES.additionalVehicle per extra vehicle, all in one record.
 * India is free. Constants live in lib/pricing.ts.
 */
export function getVerificationFeeMinorUnits(
  account: {
    type: "poster" | "driver" | "both";
    currency?: string | null;
    country?: string | null;
  },
  additionalVehicles = 0,
) {
  if (isFeeFreeMarket(account)) return 0;
  const lines = verificationPathFeeLines(verificationPathForAccountType(account.type), additionalVehicles);
  return verificationFeeTotalMinorUnits(lines, account.currency || "GBP");
}

/** Backwards-compatible alias; EUR accounts also use currency minor units (cents). */
export const getVerificationFeePence = getVerificationFeeMinorUnits;

export const STAGING_PILOT_QA_RUN_ID = "uk-market-student-qa";

/** Same rule the job routes use: tester + GB/GBP + pilot run id + staging-only QA guard. */
export function isStagingPilotQaAccount(account: {
  isTester?: boolean | null; country?: string | null; currency?: string | null; qaTestAccounts?: Array<{ runId: string }> | null;
}) {
  return Boolean(account.isTester && isUkAccount(account) && Array.isArray(account.qaTestAccounts) &&
    account.qaTestAccounts.some((entry) => entry.runId === STAGING_PILOT_QA_RUN_ID) && isQaRunnerEnabled());
}

function marketTimeZone(account: { country?: string | null; currency?: string | null }) {
  return marketForAccount({ country: account.country ?? "", currency: account.currency ?? "" })?.timeZone ?? "UTC";
}

/**
 * Start (or resume) person-ID verification for the signed-in user.
 * Order (non-India): email verified -> phone OTP verified -> person ID (+ company).
 * Fees are recorded as ONE pending VerificationFeePayment per charged attempt.
 */
export async function createVerificationAttempt(accountId: string, userId?: string) {
  const account = await prisma.account.findUnique({
    where: { id: accountId },
    include: {
      users: { select: { id: true, emailVerifiedAt: true, personVerifiedAt: true, role: true } },
      qaTestAccounts: { select: { runId: true } },
    },
  });
  if (!account) throw new Error("Account not found.");

  // Person verification is a UK GB + GBP workflow only. India is an open
  // marketplace and must never be routed into person/company verification.
  if (account.verificationStatus === "suspended") throw new Error("Account is suspended.");
  if (!isUkAccount(account)) {
    throw new Error("Person verification is only available to GB + GBP accounts.");
  }

  const users = account.users ?? [];
  const user = userId ? users.find((candidate) => candidate.id === userId) : users.find((candidate) => candidate.role === "owner") ?? users[0];
  if (!user) throw new Error("Account not found.");

  const stagingPilotQa = isStagingPilotQaAccount(account);
  const orderBlock = verificationOrderBlock(account, user, { stagingPilotQa });
  if (orderBlock) throw new Error(ORDER_BLOCK_MESSAGES[orderBlock]);

  const accountVerified = account.verificationStatus === "verified";
  if (accountVerified && (user.personVerifiedAt || !userId)) {
    return { alreadyVerified: true, account };
  }

  return prisma.$transaction(async (tx) => {
    // Serialize concurrent starts for this account so one action creates one fee.
    await tx.$queryRawUnsafe('SELECT "id" FROM "Account" WHERE "id" = $1 FOR UPDATE', accountId);
    const attempts = await tx.verificationAttempt.findMany({
      where: { accountId },
      orderBy: { attemptNumber: "desc" },
    });
    const now = new Date();
    const lastSuccess = attempts.find((attempt) => attempt.status === "successful");
    const decision = decideVerificationStart({
      attempts,
      now,
      accountVerified,
      lastSuccessAt: lastSuccess?.completedAt ?? account.verifiedAt,
      activePaidPlan: hasActivePaidPlan(account, now),
      stagingPilotQa,
    });
    if (decision.kind === "existing") {
      const attempt = attempts.find((candidate) => candidate.id === decision.attemptId)!;
      return {
        alreadyVerified: false, attempt, resumed: true,
        feeMinorUnits: attempt.feeMinorUnits, feePence: attempt.feeMinorUnits, feeCurrency: attempt.feeCurrency,
      };
    }

    const attemptNumber = (attempts[0]?.attemptNumber ?? 0) + 1;
    const currency = account.currency;
    let feeMinorUnits = 0;
    let feePaymentId: string | null = null;
    if (decision.charged) {
      const path = verificationPathForAccountType(account.type);
      let vehicleIds: string[] = [];
      if (path === "driver") {
        const vehicles = await tx.vehicle.findMany({ where: { accountId }, select: { id: true }, orderBy: { createdAt: "asc" } });
        vehicleIds = await uncoveredVehicleIds(tx as never, accountId, vehicles.map((vehicle) => vehicle.id));
      }
      const fee = await recordVerificationFee(tx as never, {
        accountId, country: account.country, currency,
        action: path === "poster" ? "poster_verification" : "driver_verification",
        lines: verificationPathFeeLines(path, Math.max(0, vehicleIds.length - 1)),
        idempotencyKey: `verification:${accountId}:attempt:${attemptNumber}`,
        vehicleIds,
      });
      feeMinorUnits = fee?.record.amountMinorUnits ?? 0;
      feePaymentId = fee?.record.id ?? null;
    }

    const attempt = await tx.verificationAttempt.create({
      data: {
        accountId,
        userId: user.id,
        attemptNumber,
        cyclePosition: decision.cyclePosition,
        status: decision.charged ? "awaiting_payment" : decision.cyclePosition > 1 ? "correction" : "pending",
        feeMinorUnits,
        feeCurrency: currency,
        // "unpaid" until a verified provider event; free attempts are "waived".
        feeStatus: decision.charged ? "unpaid" : "waived",
        feePaymentId,
      },
    });

    // A responsible-person check on an already verified account never downgrades it.
    if (!accountVerified) {
      await tx.account.update({
        where: { id: accountId },
        data: {
          verificationStatus: decision.charged ? "payment_pending" : "pending",
          lastActivityAt: now,
        },
      });
    }

    return {
      alreadyVerified: false,
      attempt,
      reason: decision.reason,
      feeMinorUnits,
      // Legacy response alias until all integrations use currency-neutral names.
      feePence: feeMinorUnits,
      feeCurrency: currency,
    };
  });
}

/**
 * Driver/fleet path fee for an already verified poster upgrading to driver
 * (EXECUTION_PLAN §5): 3.50 once, person check reused, extra uncovered vehicles
 * at 0.50 each in the same record. Idempotent per account. Returns null for India
 * or when the account already paid a driver-path fee.
 */
export async function recordDriverUpgradeFee(accountId: string) {
  return prisma.$transaction(async (tx) => {
    await tx.$queryRawUnsafe('SELECT "id" FROM "Account" WHERE "id" = $1 FOR UPDATE', accountId);
    const account = await tx.account.findUnique({ where: { id: accountId }, select: { id: true, country: true, currency: true } });
    if (!account || isFeeFreeMarket(account)) return null;
    const prior = await tx.verificationFeePayment.findFirst({
      where: { accountId, action: { in: ["driver_verification", "driver_upgrade"] } }, select: { id: true },
    });
    if (prior) return null;
    const vehicles = await tx.vehicle.findMany({ where: { accountId }, select: { id: true }, orderBy: { createdAt: "asc" } });
    const vehicleIds = await uncoveredVehicleIds(tx as never, accountId, vehicles.map((vehicle) => vehicle.id));
    return recordVerificationFee(tx as never, {
      accountId, country: account.country, currency: account.currency, action: "driver_upgrade",
      lines: verificationPathFeeLines("driver", Math.max(0, vehicleIds.length - 1)),
      idempotencyKey: `driver-upgrade:${accountId}`,
      vehicleIds,
    });
  });
}

export async function markVerificationSuccessful(attemptId: string, providerReference?: string) {
  const account = await prisma.$transaction(async (tx) => {
    // Serialize provider retries for this attempt before reading its status.
    const lockedAttempts = await tx.$queryRawUnsafe<Array<{ id: string }>>(
      'SELECT "id" FROM "VerificationAttempt" WHERE "id" = $1 FOR UPDATE', attemptId,
    );
    if (lockedAttempts.length !== 1) throw new Error("Verification attempt not found.");
    const attempt = await tx.verificationAttempt.findUnique({
      where: { id: attemptId },
      include: { account: true },
    });
    if (!attempt) throw new Error("Verification attempt not found.");

    // The webhook must never verify an India account or restore a suspended
    // account, including for legacy attempts created before market guards.
    if (!isUkAccount(attempt.account)) {
      throw new Error("Person verification is only available to GB + GBP accounts.");
    }
    if (attempt.account.deletionRequestedAt) {
      throw new Error("Account is pending deletion.");
    }
    if (attempt.account.verificationStatus === "suspended") {
      throw new Error("Account is suspended.");
    }

    // Webhook retries are idempotent. A late success must never resurrect
    // an expired/terminal attempt or overwrite a newer account state.
    if (attempt.status === "successful") return attempt.account;

    const claimed = await tx.verificationAttempt.updateMany({
      where: {
        id: attemptId,
        status: { in: ["awaiting_payment", "pending", "correction", "manual_review"] },
      },
      data: {
        status: "successful",
        completedAt: new Date(),
        notes: providerReference ? `Provider reference: ${providerReference}` : undefined,
      },
    });
    if (claimed.count !== 1) throw new Error("Verification attempt is no longer eligible for completion.");

    // Record which user passed person ID (needed to name a responsible person).
    if (attempt.userId) {
      await tx.user.updateMany({ where: { id: attempt.userId, accountId: attempt.accountId }, data: { personVerifiedAt: new Date() } });
    }
    // A second user's check on an already verified account leaves the account as is.
    if (attempt.account.verificationStatus === "verified") return attempt.account;

    const accountUpdate = await tx.account.updateMany({
      where: {
        id: attempt.accountId,
        deletionRequestedAt: null,
        verificationStatus: { in: ["payment_pending", "pending", "failed", "manual_review"] },
      },
      data: {
        verificationStatus: "verified",
        verifiedAt: new Date(),
        lastActivityAt: new Date(),
        inactiveSince: null,
      },
    });
    if (accountUpdate.count !== 1) throw new Error("Account is no longer eligible for verification.");

    return tx.account.findUniqueOrThrow({ where: { id: attempt.accountId } });
  });

  // Keep these side effects retryable and outside the DB transaction.
  // Their own helpers must remain idempotent.
  if (isUkAccount(account)) {
    try {
      await startPromotionForVerifiedAccount(account.id);
    } catch (error) {
      console.error("Promotion startup error:", {
        errorName: error instanceof Error ? error.name : "UnknownError",
      });
    }
    await markReferralVerified(account.id);
  }
  return account;
}

export async function markVerificationFailed(attemptId: string, failureReasons?: unknown) {
  return prisma.$transaction(async (tx) => {
    const lockedAttempts = await tx.$queryRawUnsafe<Array<{ id: string }>>(
      'SELECT "id" FROM "VerificationAttempt" WHERE "id" = $1 FOR UPDATE', attemptId,
    );
    if (lockedAttempts.length !== 1) throw new Error("Verification attempt not found.");
    const attempt = await tx.verificationAttempt.findUnique({
      where: { id: attemptId },
      include: { account: true },
    });
    if (!attempt) throw new Error("Verification attempt not found.");
    if (!isUkAccount(attempt.account)) {
      throw new Error("Person verification is only available to GB + GBP accounts.");
    }
    if (attempt.account.deletionRequestedAt) {
      throw new Error("Account is pending deletion.");
    }
    if (attempt.account.verificationStatus === "suspended") {
      throw new Error("Account is suspended.");
    }

    // A delayed failure event must not downgrade a completed verification.
    if (attempt.status === "successful") return { status: "successful", deadline: null };

    const now = new Date();
    // 10 working days after the first failure, a final 3 after the second,
    // counted Mon-Fri in the account's market time zone.
    const outcome = failureOutcome(attempt.cyclePosition, now, marketTimeZone(attempt.account));
    const status = outcome.status;
    const nextDeadline = outcome.correctionDeadline ?? outcome.finalEvidenceDeadline;
    const changed = await tx.verificationAttempt.updateMany({
      where: {
        id: attemptId,
        status: { in: ["awaiting_payment", "pending", "correction", "manual_review"] },
      },
      data: {
        status,
        failedAt: now,
        correctionDeadline: outcome.correctionDeadline,
        finalEvidenceDeadline: outcome.finalEvidenceDeadline,
        failureReasons: failureReasons || undefined,
      },
    });
    if (changed.count !== 1) throw new Error("Verification attempt is no longer eligible for failure processing.");

    // A failed responsible-person check never downgrades an already verified account.
    if (attempt.account.verificationStatus === "verified") return { status, deadline: nextDeadline };

    const accountStatus = outcome.accountStatus;
    const accountChanged = await tx.account.updateMany({
      where: {
        id: attempt.accountId,
        deletionRequestedAt: null,
        verificationStatus: { in: ["payment_pending", "pending", "failed", "manual_review"] },
      },
      data: { verificationStatus: accountStatus },
    });
    if (accountChanged.count !== 1) throw new Error("Account is no longer eligible for verification failure processing.");

    return { status, deadline: nextDeadline };
  });
}
