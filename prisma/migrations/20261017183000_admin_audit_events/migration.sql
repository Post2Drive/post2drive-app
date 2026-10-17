CREATE TABLE "AdminAuditEvent" (
  "id" TEXT NOT NULL,
  "actor" TEXT NOT NULL,
  "action" TEXT NOT NULL,
  "entityType" TEXT NOT NULL,
  "entityId" TEXT,
  "market" TEXT,
  "details" JSONB,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AdminAuditEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "AdminAuditEvent_createdAt_idx" ON "AdminAuditEvent"("createdAt");
CREATE INDEX "AdminAuditEvent_entityType_entityId_idx" ON "AdminAuditEvent"("entityType", "entityId");
CREATE INDEX "AdminAuditEvent_market_createdAt_idx" ON "AdminAuditEvent"("market", "createdAt");