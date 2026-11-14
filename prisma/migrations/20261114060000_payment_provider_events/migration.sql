-- Payment provider integration: durable webhook-event ledger (replay/duplicate
-- protection) and a refund timestamp on subscription payments. Additive only.
ALTER TABLE "SubscriptionPayment" ADD COLUMN "refundedAt" TIMESTAMP(3);

CREATE TABLE "PaymentProviderEvent" (
    "id" TEXT NOT NULL,
    "provider" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "outcome" TEXT NOT NULL,
    "paymentId" TEXT,
    "receivedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PaymentProviderEvent_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PaymentProviderEvent_provider_eventId_key" ON "PaymentProviderEvent"("provider", "eventId");
CREATE INDEX "PaymentProviderEvent_paymentId_idx" ON "PaymentProviderEvent"("paymentId");
CREATE INDEX "PaymentProviderEvent_receivedAt_idx" ON "PaymentProviderEvent"("receivedAt");
