-- Verification order, responsible person, fees and correction windows (EXECUTION_PLAN §1, §5).

ALTER TABLE "Account" ADD COLUMN "companyResponsibleUserId" TEXT;
ALTER TABLE "User" ADD COLUMN "personVerifiedAt" TIMESTAMP(3);

ALTER TABLE "VerificationAttempt" ADD COLUMN "cyclePosition" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "VerificationAttempt" ADD COLUMN "userId" TEXT;
ALTER TABLE "VerificationAttempt" ADD COLUMN "feePaymentId" TEXT;

CREATE TABLE "VerificationFeePayment" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "lineItems" JSONB NOT NULL,
    "amountMinorUnits" INTEGER NOT NULL,
    "currency" TEXT NOT NULL,
    "vehicleIds" TEXT[] DEFAULT ARRAY[]::TEXT[],
    "status" TEXT NOT NULL DEFAULT 'pending',
    "idempotencyKey" TEXT NOT NULL,
    "provider" TEXT,
    "providerPaymentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paidAt" TIMESTAMP(3),
    CONSTRAINT "VerificationFeePayment_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "VerificationFeePayment_idempotencyKey_key" ON "VerificationFeePayment"("idempotencyKey");
CREATE UNIQUE INDEX "VerificationFeePayment_providerPaymentId_key" ON "VerificationFeePayment"("providerPaymentId");
CREATE INDEX "VerificationFeePayment_accountId_status_idx" ON "VerificationFeePayment"("accountId", "status");
ALTER TABLE "VerificationFeePayment" ADD CONSTRAINT "VerificationFeePayment_accountId_fkey"
    FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Backfill: legacy attempt 2 was the free correction of attempt 1.
UPDATE "VerificationAttempt" SET "cyclePosition" = LEAST("attemptNumber", 3);

-- Backfill: on already person-verified accounts, the owner user is treated as the
-- person who passed ID and, where the company is verified, as its responsible person.
UPDATE "User" u SET "personVerifiedAt" = a."verifiedAt"
FROM "Account" a
WHERE u."accountId" = a."id" AND u."role" = 'owner' AND a."verificationStatus" = 'verified' AND a."verifiedAt" IS NOT NULL;

UPDATE "Account" a SET "companyResponsibleUserId" = (
    SELECT u."id" FROM "User" u
    WHERE u."accountId" = a."id" AND u."role" = 'owner' AND u."personVerifiedAt" IS NOT NULL
    ORDER BY u."createdAt" ASC LIMIT 1)
WHERE a."companyVerificationStatus" = 'verified' AND a."companyResponsibleUserId" IS NULL;
