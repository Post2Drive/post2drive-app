-- India accounts may be created and authenticated without an email address.
-- PostgreSQL unique constraints continue to prevent duplicate non-null email addresses.
ALTER TABLE "User" ALTER COLUMN "email" DROP NOT NULL;

-- India uses phone OTP as its sole platform verification gate.
ALTER TABLE "Account" ADD COLUMN "phoneVerifiedAt" TIMESTAMP(3);
