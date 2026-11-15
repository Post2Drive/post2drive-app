-- Adds the `disputed` job status (under administrator review). Additive only:
-- existing rows are unchanged and no route writes this value yet.
ALTER TYPE "JobStatus" ADD VALUE IF NOT EXISTS 'disputed';
