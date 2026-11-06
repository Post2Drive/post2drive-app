-- Launch windows, separate POST/DRIVE entitlements and the driver waitlist (EXECUTION_PLAN §3–§4).
-- Hand-written (Prisma engines are unavailable in the authoring environment); additive only.
-- Deprecated, NOT dropped: Account.freeMonthsEarned/extensionCount/graceUsed, PromotionConfig, TrialCycle.
-- No launch dates are inserted: until an operator inserts the "global" LaunchConfig row, free windows
-- are disabled (fail closed) and the missing configuration is reported by /api/promotion/status and /api/account/access.

CREATE TABLE "LaunchConfig" (
    "id" TEXT NOT NULL DEFAULT 'global',
    "posterWindowStart" TIMESTAMP(3) NOT NULL,
    "posterWindowEnd" TIMESTAMP(3) NOT NULL,
    "driverWindowStart" TIMESTAMP(3) NOT NULL,
    "driverWindowEnd" TIMESTAMP(3) NOT NULL,
    "newPosterTrialDays" INTEGER NOT NULL DEFAULT 30,
    "driverWaitlistRatio" DOUBLE PRECISION NOT NULL DEFAULT 1.0,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LaunchConfig_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Account" ADD COLUMN "operatingRegion" TEXT;
ALTER TABLE "Account" ADD COLUMN "driverWaitlistedAt" TIMESTAMP(3);
ALTER TABLE "Account" ADD COLUMN "driverAdmittedAt" TIMESTAMP(3);
ALTER TABLE "Account" ADD COLUMN "switchToPosterRequestedAt" TIMESTAMP(3);

CREATE INDEX "Account_operatingRegion_driverWaitlistedAt_idx" ON "Account"("operatingRegion", "driverWaitlistedAt");
