-- Store all charge amounts in the currency's minor units, and retain the fee currency.
ALTER TABLE "SubscriptionPayment" RENAME COLUMN "amountPence" TO "amountMinorUnits";
ALTER TABLE "VerificationAttempt" RENAME COLUMN "feePence" TO "feeMinorUnits";
ALTER TABLE "VerificationAttempt"
  ADD COLUMN "feeCurrency" TEXT NOT NULL DEFAULT 'GBP';

-- Existing fees are associated with the immutable currency of the account that incurred them.
UPDATE "VerificationAttempt" AS attempt
SET "feeCurrency" = account."currency"
FROM "Account" AS account
WHERE attempt."accountId" = account."id";
