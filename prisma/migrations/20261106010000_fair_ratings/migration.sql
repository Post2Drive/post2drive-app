-- Fair rating policy (lib/ratingPolicy.ts): outcome label, required reasons, blind visibility.
ALTER TABLE "Rating" ADD COLUMN "outcome" TEXT NOT NULL DEFAULT 'completed';
ALTER TABLE "Rating" ADD COLUMN "reasonCode" TEXT;
ALTER TABLE "Rating" ADD COLUMN "visibleAfter" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

-- Existing ratings were already public: keep them visible from when they were made.
UPDATE "Rating" SET "visibleAfter" = "createdAt";

CREATE INDEX "Rating_rateeId_visibleAfter_idx" ON "Rating"("rateeId", "visibleAfter");
