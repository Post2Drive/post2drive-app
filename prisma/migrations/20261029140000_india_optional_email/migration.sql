-- India accounts may be created and authenticated without an email address.
-- PostgreSQL unique constraints continue to prevent duplicate non-null email addresses.
ALTER TABLE "User" ALTER COLUMN "email" DROP NOT NULL;
