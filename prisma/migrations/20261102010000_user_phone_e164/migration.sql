-- Normalised phone for lookups (India phone login / recovery).
ALTER TABLE "User" ADD COLUMN "phoneE164" TEXT;
CREATE INDEX "User_phoneE164_idx" ON "User"("phoneE164");

-- Backfill India accounts: keep digits, accept optional 91 / 0 prefix, require a 6-9 mobile start.
UPDATE "User" u
SET "phoneE164" = '+91' || right(regexp_replace(u."phone", '\D', '', 'g'), 10)
FROM "Account" a
WHERE a."id" = u."accountId"
  AND a."country" = 'IN'
  AND regexp_replace(u."phone", '\D', '', 'g') ~ '^(91|0)?[6-9][0-9]{9}$';

-- Backfill UK accounts: +44… or 0… with ten digits after the trunk prefix.
UPDATE "User" u
SET "phoneE164" = '+44' || right(regexp_replace(u."phone", '\D', '', 'g'), 10)
FROM "Account" a
WHERE a."id" = u."accountId"
  AND a."country" = 'GB'
  AND regexp_replace(u."phone", '\D', '', 'g') ~ '^(44|0)[0-9]{10}$';
