CREATE TABLE "AccountBlock" (
    "id" TEXT NOT NULL,
    "blockerId" TEXT NOT NULL,
    "blockedId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "AccountBlock_pkey" PRIMARY KEY ("id")
);
CREATE UNIQUE INDEX "AccountBlock_blockerId_blockedId_key" ON "AccountBlock"("blockerId", "blockedId");
CREATE INDEX "AccountBlock_blockedId_createdAt_idx" ON "AccountBlock"("blockedId", "createdAt");
ALTER TABLE "AccountBlock" ADD CONSTRAINT "AccountBlock_blockerId_fkey" FOREIGN KEY ("blockerId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "AccountBlock" ADD CONSTRAINT "AccountBlock_blockedId_fkey" FOREIGN KEY ("blockedId") REFERENCES "Account"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "ModerationReport" (
    "id" TEXT NOT NULL,
    "reporterId" TEXT NOT NULL,
    "reportedAccountId" TEXT,
    "jobId" TEXT,
    "reason" TEXT NOT NULL,
    "details" TEXT,
    "status" TEXT NOT NULL DEFAULT 'open',
    "adminNotes" TEXT,
    "reviewerAccountId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "reviewedAt" TIMESTAMP(3),
    CONSTRAINT "ModerationReport_pkey" PRIMARY KEY ("id")
);
CREATE INDEX "ModerationReport_status_createdAt_idx" ON "ModerationReport"("status", "createdAt");
CREATE INDEX "ModerationReport_reporterId_createdAt_idx" ON "ModerationReport"("reporterId", "createdAt");
CREATE INDEX "ModerationReport_reportedAccountId_createdAt_idx" ON "ModerationReport"("reportedAccountId", "createdAt");
CREATE INDEX "ModerationReport_jobId_createdAt_idx" ON "ModerationReport"("jobId", "createdAt");
ALTER TABLE "ModerationReport" ADD CONSTRAINT "ModerationReport_reporterId_fkey" FOREIGN KEY ("reporterId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ModerationReport" ADD CONSTRAINT "ModerationReport_reportedAccountId_fkey" FOREIGN KEY ("reportedAccountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ModerationReport" ADD CONSTRAINT "ModerationReport_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "ModerationReport" ADD CONSTRAINT "ModerationReport_reviewerAccountId_fkey" FOREIGN KEY ("reviewerAccountId") REFERENCES "Account"("id") ON DELETE SET NULL ON UPDATE CASCADE;
