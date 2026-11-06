-- Vehicle approval, fleet ownership/insurance rules, driver identity and per-job
-- driver record (EXECUTION_PLAN §6). Hand-written: the Prisma engine download is
-- blocked in the authoring environment. All new columns are nullable or defaulted,
-- so existing rows remain valid and no backfill is needed.

-- Vehicle: ownership/insurance evidence, admin review outcome, interim 0.50 fee.
ALTER TABLE "Vehicle"
  ADD COLUMN "registeredKeeperType" TEXT,
  ADD COLUMN "registeredKeeperName" TEXT,
  ADD COLUMN "leaseAgreementUrl" TEXT,
  ADD COLUMN "insurancePolicyholderName" TEXT,
  ADD COLUMN "insuranceCoverType" TEXT,
  ADD COLUMN "insurancePolicyNumber" TEXT,
  ADD COLUMN "reviewedAt" TIMESTAMP(3),
  ADD COLUMN "rejectionReason" TEXT,
  ADD COLUMN "rejectionCount" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "correctionDeadline" TIMESTAMP(3),
  ADD COLUMN "additionalVehicleFeeMinorUnits" INTEGER,
  ADD COLUMN "additionalVehicleFeeCurrency" TEXT,
  ADD COLUMN "additionalVehicleFeeStatus" "VerificationFeeStatus";

CREATE INDEX "Vehicle_verificationStatus_createdAt_idx" ON "Vehicle"("verificationStatus", "createdAt");

-- Bid: driver/vehicle a fleet declares when bidding (licence stored as keyed hash + last 4).
ALTER TABLE "Bid"
  ADD COLUMN "fleetDriverName" TEXT,
  ADD COLUMN "fleetDriverLicenceHash" TEXT,
  ADD COLUMN "fleetDriverLicenceLast4" TEXT,
  ADD COLUMN "fleetVehicleId" TEXT;

-- Insurance reviewed once per policy per account.
CREATE TABLE "InsurancePolicyReview" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "policyKey" TEXT NOT NULL,
    "policyholderName" TEXT NOT NULL,
    "policyNumber" TEXT NOT NULL,
    "coverType" TEXT NOT NULL,
    "reviewedBy" TEXT NOT NULL,
    "reviewedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "InsurancePolicyReview_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "InsurancePolicyReview_accountId_policyKey_key" ON "InsurancePolicyReview"("accountId", "policyKey");
ALTER TABLE "InsurancePolicyReview" ADD CONSTRAINT "InsurancePolicyReview_accountId_fkey"
  FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- One verified driving licence per account; a licence can belong to only one account.
CREATE TABLE "DriverIdentity" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "licenceHash" TEXT NOT NULL,
    "licenceLast4" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DriverIdentity_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "DriverIdentity_accountId_key" ON "DriverIdentity"("accountId");
CREATE UNIQUE INDEX "DriverIdentity_licenceHash_key" ON "DriverIdentity"("licenceHash");
ALTER TABLE "DriverIdentity" ADD CONSTRAINT "DriverIdentity_accountId_fkey"
  FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- Driver + vehicle recorded for each matched job.
CREATE TABLE "JobDriverAssignment" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "vehicleId" TEXT,
    "vehicleRegPlate" TEXT NOT NULL,
    "vehicleType" TEXT NOT NULL,
    "driverName" TEXT NOT NULL,
    "licenceHash" TEXT,
    "licenceLast4" TEXT,
    "source" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "JobDriverAssignment_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "JobDriverAssignment_jobId_key" ON "JobDriverAssignment"("jobId");
CREATE INDEX "JobDriverAssignment_accountId_idx" ON "JobDriverAssignment"("accountId");
ALTER TABLE "JobDriverAssignment" ADD CONSTRAINT "JobDriverAssignment_jobId_fkey"
  FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "JobDriverAssignment" ADD CONSTRAINT "JobDriverAssignment_vehicleId_fkey"
  FOREIGN KEY ("vehicleId") REFERENCES "Vehicle"("id") ON DELETE SET NULL ON UPDATE CASCADE;
