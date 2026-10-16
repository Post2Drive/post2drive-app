CREATE TABLE "IncidentEvidence" (
    "id" TEXT NOT NULL,
    "incidentId" TEXT NOT NULL,
    "jobId" TEXT NOT NULL,
    "uploadedById" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "content" BYTEA NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "IncidentEvidence_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "IncidentEvidence_incidentId_createdAt_idx" ON "IncidentEvidence"("incidentId", "createdAt");
CREATE INDEX "IncidentEvidence_jobId_createdAt_idx" ON "IncidentEvidence"("jobId", "createdAt");

ALTER TABLE "IncidentEvidence"
ADD CONSTRAINT "IncidentEvidence_incidentId_fkey"
FOREIGN KEY ("incidentId") REFERENCES "JobActivity"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "IncidentEvidence"
ADD CONSTRAINT "IncidentEvidence_jobId_fkey"
FOREIGN KEY ("jobId") REFERENCES "Job"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "IncidentEvidence"
ADD CONSTRAINT "IncidentEvidence_uploadedById_fkey"
FOREIGN KEY ("uploadedById") REFERENCES "Account"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;
