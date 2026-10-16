-- CreateEnum
CREATE TYPE "AccountType" AS ENUM ('poster', 'driver', 'both');

-- CreateEnum
CREATE TYPE "PlanType" AS ENUM ('individual', 'fleet');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('promotional', 'active', 'past_due', 'cancelled', 'inactive');

-- CreateEnum
CREATE TYPE "UserRole" AS ENUM ('owner', 'member');

-- CreateEnum
CREATE TYPE "VerificationStatus" AS ENUM ('not_started', 'payment_pending', 'pending', 'failed', 'manual_review', 'verified', 'suspended');

-- CreateEnum
CREATE TYPE "VerificationAttemptStatus" AS ENUM ('awaiting_payment', 'pending', 'failed', 'correction', 'manual_review', 'successful', 'expired');

-- CreateEnum
CREATE TYPE "VerificationFeeStatus" AS ENUM ('unpaid', 'paid', 'waived');

-- CreateEnum
CREATE TYPE "JobStatus" AS ENUM ('open', 'accepted', 'in_transit', 'delivered', 'completed', 'cancelled');

-- CreateEnum
CREATE TYPE "PriceMode" AS ENUM ('fixed', 'bid');

-- CreateEnum
CREATE TYPE "BidStatus" AS ENUM ('active', 'invalidated');

-- CreateEnum
CREATE TYPE "ReferralStatus" AS ENUM ('pending', 'qualified', 'rejected');

-- CreateEnum
CREATE TYPE "OpportunityStatus" AS ENUM ('exposed', 'viewed', 'bid', 'accepted', 'expired', 'unavailable');

-- CreateEnum
CREATE TYPE "QualificationSide" AS ENUM ('driver', 'poster');

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "type" "AccountType" NOT NULL,
    "planType" "PlanType" NOT NULL DEFAULT 'individual',
    "fleetVehicleCount" INTEGER,
    "companyName" TEXT NOT NULL,
    "companyNumber" TEXT,
    "isSoleTrader" BOOLEAN NOT NULL DEFAULT false,
    "country" TEXT NOT NULL DEFAULT 'GB',
    "currency" TEXT NOT NULL DEFAULT 'GBP',
    "displayId" TEXT NOT NULL,
    "marketingConsent" BOOLEAN NOT NULL DEFAULT false,
    "marketingConsentAt" TIMESTAMP(3),
    "verificationStatus" "VerificationStatus" NOT NULL DEFAULT 'not_started',
    "verifiedAt" TIMESTAMP(3),
    "lastActivityAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "inactiveSince" TIMESTAMP(3),
    "promotionParticipant" BOOLEAN NOT NULL DEFAULT false,
    "trialStartedAt" TIMESTAMP(3),
    "trialEndsAt" TIMESTAMP(3),
    "freeEndsAt" TIMESTAMP(3),
    "freeMonthsEarned" INTEGER NOT NULL DEFAULT 0,
    "extensionCount" INTEGER NOT NULL DEFAULT 0,
    "graceUsed" BOOLEAN NOT NULL DEFAULT false,
    "subscriptionStatus" "SubscriptionStatus" NOT NULL DEFAULT 'inactive',
    "subscriptionPlanKey" TEXT,
    "subscriptionStartedAt" TIMESTAMP(3),
    "subscriptionEndsAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SubscriptionPayment" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "planKey" TEXT NOT NULL,
    "amountPence" INTEGER NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'GBP',
    "status" TEXT NOT NULL DEFAULT 'pending',
    "provider" TEXT,
    "providerPaymentId" TEXT,
    "providerCheckoutId" TEXT,
    "accessStartedAt" TIMESTAMP(3),
    "accessEndsAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paidAt" TIMESTAMP(3),

    CONSTRAINT "SubscriptionPayment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PromotionConfig" (
    "id" TEXT NOT NULL DEFAULT 'global',
    "name" TEXT NOT NULL DEFAULT 'Launch Promotion',
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PromotionConfig_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "VerificationAttempt" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "attemptNumber" INTEGER NOT NULL,
    "status" "VerificationAttemptStatus" NOT NULL DEFAULT 'awaiting_payment',
    "feePence" INTEGER NOT NULL,
    "feeStatus" "VerificationFeeStatus" NOT NULL DEFAULT 'unpaid',
    "submittedAt" TIMESTAMP(3),
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "failedAt" TIMESTAMP(3),
    "correctionDeadline" TIMESTAMP(3),
    "finalEvidenceDeadline" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "failureReasons" JSONB,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "VerificationAttempt_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Rating" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "raterId" TEXT NOT NULL,
    "rateeId" TEXT NOT NULL,
    "stars" INTEGER NOT NULL,
    "comment" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Rating_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Vehicle" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "vehicleType" TEXT NOT NULL,
    "regPlate" TEXT NOT NULL,
    "ownershipType" TEXT,
    "make" TEXT,
    "model" TEXT,
    "mamKg" INTEGER,
    "v5cDocumentUrl" TEXT,
    "insuranceDocumentUrl" TEXT,
    "operatorLicenceNo" TEXT,
    "verificationStatus" "VerificationStatus" NOT NULL DEFAULT 'not_started',
    "verifiedAt" TIMESTAMP(3),
    "motValidUntil" TIMESTAMP(3),
    "insuranceValidUntil" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Vehicle_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "UserRole" NOT NULL DEFAULT 'owner',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PasswordResetToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "token" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PasswordResetToken_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Job" (
    "id" TEXT NOT NULL,
    "posterId" TEXT NOT NULL,
    "pickup" TEXT NOT NULL,
    "pickupLat" DOUBLE PRECISION,
    "pickupLng" DOUBLE PRECISION,
    "dropoff" TEXT NOT NULL,
    "dropoffLat" DOUBLE PRECISION,
    "dropoffLng" DOUBLE PRECISION,
    "jobDate" TIMESTAMP(3) NOT NULL,
    "pickupTime" TEXT,
    "dropoffTime" TEXT,
    "vehicleType" TEXT NOT NULL,
    "weightKg" DOUBLE PRECISION,
    "dimensions" TEXT,
    "crossBorder" BOOLEAN NOT NULL DEFAULT false,
    "price" DOUBLE PRECISION NOT NULL,
    "pricePerMile" DOUBLE PRECISION,
    "currency" TEXT NOT NULL DEFAULT 'GBP',
    "priceMode" "PriceMode" NOT NULL DEFAULT 'fixed',
    "notes" TEXT,
    "status" "JobStatus" NOT NULL DEFAULT 'open',
    "acceptedById" TEXT,
    "invitedAccountId" TEXT,
    "pickupConfirmedById" TEXT,
    "pickupContactName" TEXT,
    "pickupContactPhone" TEXT,
    "dropoffContactName" TEXT,
    "dropoffContactPhone" TEXT,
    "deliveryMarkedById" TEXT,
    "cancelledById" TEXT,
    "cancelledAt" TIMESTAMP(3),
    "paidMarkedById" TEXT,
    "paidMarkedAt" TIMESTAMP(3),
    "receivedConfirmedById" TEXT,
    "receivedConfirmedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Job_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Bid" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "bidderId" TEXT NOT NULL,
    "amount" DOUBLE PRECISION NOT NULL,
    "status" "BidStatus" NOT NULL DEFAULT 'active',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Bid_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Referral" (
    "id" TEXT NOT NULL,
    "referrerId" TEXT NOT NULL,
    "referredAccountId" TEXT NOT NULL,
    "status" "ReferralStatus" NOT NULL DEFAULT 'pending',
    "verifiedAt" TIMESTAMP(3),
    "qualifyingJobId" TEXT,
    "qualifyingJobAt" TIMESTAMP(3),
    "rejectedAt" TIMESTAMP(3),
    "rejectionReason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Referral_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DriverOpportunity" (
    "id" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "status" "OpportunityStatus" NOT NULL DEFAULT 'exposed',
    "exposedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastSeenAt" TIMESTAMP(3),
    "viewedAt" TIMESTAMP(3),
    "bidAt" TIMESTAMP(3),
    "acceptedAt" TIMESTAMP(3),
    "expiredAt" TIMESTAMP(3),
    "reason" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DriverOpportunity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "QualificationSnapshot" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "side" "QualificationSide" NOT NULL,
    "cycleNumber" INTEGER NOT NULL,
    "evaluatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "normalTarget" INTEGER NOT NULL,
    "adjustedTarget" INTEGER NOT NULL,
    "actualAmount" INTEGER NOT NULL,
    "fairnessRatio" DOUBLE PRECISION NOT NULL,
    "opportunitiesAvailable" INTEGER NOT NULL,
    "opportunitiesRequired" INTEGER NOT NULL,
    "userParticipationRatio" DOUBLE PRECISION,
    "qualified" BOOLEAN NOT NULL DEFAULT false,
    "graceGranted" BOOLEAN NOT NULL DEFAULT false,
    "explanation" TEXT,

    CONSTRAINT "QualificationSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PlatformUsageEvent" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "eventKey" TEXT NOT NULL,
    "amountPence" INTEGER,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlatformUsageEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "JobActivity" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "actorId" TEXT,
    "action" TEXT NOT NULL,
    "fromStatus" "JobStatus",
    "toStatus" "JobStatus",
    "description" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobActivity_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Account_displayId_key" ON "Account"("displayId");

-- CreateIndex
CREATE UNIQUE INDEX "SubscriptionPayment_providerPaymentId_key" ON "SubscriptionPayment"("providerPaymentId");

-- CreateIndex
CREATE UNIQUE INDEX "SubscriptionPayment_providerCheckoutId_key" ON "SubscriptionPayment"("providerCheckoutId");

-- CreateIndex
CREATE INDEX "SubscriptionPayment_accountId_createdAt_idx" ON "SubscriptionPayment"("accountId", "createdAt");

-- CreateIndex
CREATE INDEX "SubscriptionPayment_accountId_status_idx" ON "SubscriptionPayment"("accountId", "status");

-- CreateIndex
CREATE INDEX "VerificationAttempt_accountId_status_idx" ON "VerificationAttempt"("accountId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "VerificationAttempt_accountId_attemptNumber_key" ON "VerificationAttempt"("accountId", "attemptNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Rating_jobId_raterId_key" ON "Rating"("jobId", "raterId");

-- CreateIndex
CREATE INDEX "Vehicle_regPlate_idx" ON "Vehicle"("regPlate");

-- CreateIndex
CREATE INDEX "Vehicle_accountId_idx" ON "Vehicle"("accountId");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "PasswordResetToken_token_key" ON "PasswordResetToken"("token");

-- CreateIndex
CREATE INDEX "Job_status_idx" ON "Job"("status");

-- CreateIndex
CREATE INDEX "Job_posterId_idx" ON "Job"("posterId");

-- CreateIndex
CREATE INDEX "Job_acceptedById_idx" ON "Job"("acceptedById");

-- CreateIndex
CREATE INDEX "Job_vehicleType_idx" ON "Job"("vehicleType");

-- CreateIndex
CREATE INDEX "Job_createdAt_idx" ON "Job"("createdAt");

-- CreateIndex
CREATE INDEX "Bid_jobId_idx" ON "Bid"("jobId");

-- CreateIndex
CREATE INDEX "Bid_bidderId_idx" ON "Bid"("bidderId");

-- CreateIndex
CREATE UNIQUE INDEX "Referral_referredAccountId_key" ON "Referral"("referredAccountId");

-- CreateIndex
CREATE INDEX "Referral_referrerId_status_idx" ON "Referral"("referrerId", "status");

-- CreateIndex
CREATE INDEX "DriverOpportunity_driverId_status_idx" ON "DriverOpportunity"("driverId", "status");

-- CreateIndex
CREATE INDEX "DriverOpportunity_jobId_idx" ON "DriverOpportunity"("jobId");

-- CreateIndex
CREATE UNIQUE INDEX "DriverOpportunity_driverId_jobId_key" ON "DriverOpportunity"("driverId", "jobId");

-- CreateIndex
CREATE INDEX "QualificationSnapshot_accountId_side_cycleNumber_idx" ON "QualificationSnapshot"("accountId", "side", "cycleNumber");

-- CreateIndex
CREATE INDEX "PlatformUsageEvent_accountId_eventType_createdAt_idx" ON "PlatformUsageEvent"("accountId", "eventType", "createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "PlatformUsageEvent_accountId_eventKey_key" ON "PlatformUsageEvent"("accountId", "eventKey");

-- CreateIndex
CREATE INDEX "JobActivity_jobId_createdAt_idx" ON "JobActivity"("jobId", "createdAt");

-- CreateIndex
CREATE INDEX "JobActivity_actorId_createdAt_idx" ON "JobActivity"("actorId", "createdAt");

-- CreateIndex
CREATE INDEX "JobActivity_action_createdAt_idx" ON "JobActivity"("action", "createdAt");

-- AddForeignKey
ALTER TABLE "SubscriptionPayment" ADD CONSTRAINT "SubscriptionPayment_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "VerificationAttempt" ADD CONSTRAINT "VerificationAttempt_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rating" ADD CONSTRAINT "Rating_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rating" ADD CONSTRAINT "Rating_raterId_fkey" FOREIGN KEY ("raterId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Rating" ADD CONSTRAINT "Rating_rateeId_fkey" FOREIGN KEY ("rateeId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Vehicle" ADD CONSTRAINT "Vehicle_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PasswordResetToken" ADD CONSTRAINT "PasswordResetToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_posterId_fkey" FOREIGN KEY ("posterId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Job" ADD CONSTRAINT "Job_acceptedById_fkey" FOREIGN KEY ("acceptedById") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bid" ADD CONSTRAINT "Bid_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Bid" ADD CONSTRAINT "Bid_bidderId_fkey" FOREIGN KEY ("bidderId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Referral" ADD CONSTRAINT "Referral_referrerId_fkey" FOREIGN KEY ("referrerId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Referral" ADD CONSTRAINT "Referral_referredAccountId_fkey" FOREIGN KEY ("referredAccountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DriverOpportunity" ADD CONSTRAINT "DriverOpportunity_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DriverOpportunity" ADD CONSTRAINT "DriverOpportunity_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "QualificationSnapshot" ADD CONSTRAINT "QualificationSnapshot_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PlatformUsageEvent" ADD CONSTRAINT "PlatformUsageEvent_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobActivity" ADD CONSTRAINT "JobActivity_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobActivity" ADD CONSTRAINT "JobActivity_actorId_fkey" FOREIGN KEY ("actorId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;

