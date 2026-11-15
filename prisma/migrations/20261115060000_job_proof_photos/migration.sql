-- CreateTable
CREATE TABLE "JobProofPhoto" (
    "id" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "stage" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "width" INTEGER NOT NULL,
    "height" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "content" BYTEA NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "JobProofPhoto_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "JobProofPhoto_jobId_stage_createdAt_idx" ON "JobProofPhoto"("jobId", "stage", "createdAt");

-- CreateIndex
CREATE INDEX "JobProofPhoto_expiresAt_idx" ON "JobProofPhoto"("expiresAt");

-- AddForeignKey
ALTER TABLE "JobProofPhoto" ADD CONSTRAINT "JobProofPhoto_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "JobProofPhoto" ADD CONSTRAINT "JobProofPhoto_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
