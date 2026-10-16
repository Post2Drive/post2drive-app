ALTER TABLE "Account"
  ADD COLUMN "termsAcceptedAt" TIMESTAMP(3),
  ADD COLUMN "termsVersion" TEXT,
  ADD COLUMN "marketResearch" JSONB,
  ADD COLUMN "deletionRequestedAt" TIMESTAMP(3);
