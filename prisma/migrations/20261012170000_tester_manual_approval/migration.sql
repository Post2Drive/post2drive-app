CREATE TYPE "TesterApprovalStatus" AS ENUM ('pending', 'approved', 'rejected');
ALTER TABLE "Account" ADD COLUMN "testerApprovalStatus" "TesterApprovalStatus";
