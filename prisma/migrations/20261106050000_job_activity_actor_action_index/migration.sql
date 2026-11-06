-- Add compound index on JobActivity(actorId, action, createdAt) to support
-- counting an account's self-initiated cancellations from activity history
-- (lib/cancellationLimits.ts).
-- CONCURRENTLY avoids locking the table during migration.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "JobActivity_actorId_action_createdAt_idx" ON "JobActivity"("actorId", "action", "createdAt");
