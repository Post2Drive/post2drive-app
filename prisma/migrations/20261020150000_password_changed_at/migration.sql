-- Persist the password-change version used to invalidate previously issued JWT sessions.
ALTER TABLE "User" ADD COLUMN "passwordChangedAt" TIMESTAMP(3);