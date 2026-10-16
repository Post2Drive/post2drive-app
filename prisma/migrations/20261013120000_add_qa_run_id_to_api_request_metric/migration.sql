ALTER TABLE "ApiRequestMetric"
ADD COLUMN IF NOT EXISTS "qaRunId" TEXT;

CREATE INDEX IF NOT EXISTS "ApiRequestMetric_qaRunId_createdAt_idx"
ON "ApiRequestMetric"("qaRunId", "createdAt");
