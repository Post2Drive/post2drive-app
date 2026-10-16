-- Add a persistent tester marker without changing verification state.
ALTER TABLE "Account" ADD COLUMN "isTester" BOOLEAN NOT NULL DEFAULT false;

-- Store only a hash of the configured one-time code.
CREATE TABLE "TesterAccessCode" (
    "id" TEXT NOT NULL DEFAULT 'single',
    "codeHash" TEXT NOT NULL,
    "claimedAt" TIMESTAMP(3),
    "claimedByAccountId" TEXT,
    CONSTRAINT "TesterAccessCode_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "TesterAccessCode_codeHash_key" ON "TesterAccessCode"("codeHash");
CREATE UNIQUE INDEX "TesterAccessCode_claimedByAccountId_key" ON "TesterAccessCode"("claimedByAccountId");
