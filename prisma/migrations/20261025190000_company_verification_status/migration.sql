ALTER TABLE "Account"
  ADD COLUMN "companyVerificationStatus" "VerificationStatus" NOT NULL DEFAULT 'not_started',
  ADD COLUMN "companyVerificationSubmittedAt" TIMESTAMP(3),
  ADD COLUMN "companyVerifiedAt" TIMESTAMP(3);

CREATE INDEX "Account_companyVerificationStatus_idx"
  ON "Account"("companyVerificationStatus");
