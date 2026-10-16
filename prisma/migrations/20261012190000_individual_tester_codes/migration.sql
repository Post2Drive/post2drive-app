-- Each tester invitation has its own database ID; existing claimed codes remain intact.
ALTER TABLE "TesterAccessCode" ALTER COLUMN "id" DROP DEFAULT;
