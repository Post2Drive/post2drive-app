-- Company review correction windows (EXECUTION_PLAN §5): free company corrections only
-- inside the window recorded at the failed review; afterwards a new fee applies.
ALTER TABLE "Account" ADD COLUMN "companyReviewCyclePosition" INTEGER NOT NULL DEFAULT 1;
ALTER TABLE "Account" ADD COLUMN "companyCorrectionDeadline" TIMESTAMP(3);
