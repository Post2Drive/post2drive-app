-- SMS one-time-code challenges (hashes only) and a staging-only sandbox outbox.
CREATE TABLE "PhoneOtpChallenge" (
    "phoneHash" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "consumedAt" TIMESTAMP(3),
    CONSTRAINT "PhoneOtpChallenge_pkey" PRIMARY KEY ("phoneHash")
);
CREATE INDEX "PhoneOtpChallenge_accountId_idx" ON "PhoneOtpChallenge"("accountId");
CREATE INDEX "PhoneOtpChallenge_expiresAt_idx" ON "PhoneOtpChallenge"("expiresAt");

CREATE TABLE "SmsSandboxMessage" (
    "id" TEXT NOT NULL,
    "phoneMasked" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SmsSandboxMessage_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "SmsSandboxMessage_createdAt_idx" ON "SmsSandboxMessage"("createdAt");
