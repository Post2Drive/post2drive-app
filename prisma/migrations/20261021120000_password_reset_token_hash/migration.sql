-- Existing reset tokens are invalidated before switching to hashed storage.
DELETE FROM "PasswordResetToken";

ALTER TABLE "PasswordResetToken"
  RENAME COLUMN "token" TO "tokenHash";

ALTER INDEX "PasswordResetToken_token_key"
  RENAME TO "PasswordResetToken_tokenHash_key";

ALTER TABLE "PasswordResetToken"
  ADD COLUMN "lastSentAt" TIMESTAMP(3);
