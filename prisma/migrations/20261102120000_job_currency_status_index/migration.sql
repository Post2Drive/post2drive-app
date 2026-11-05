-- Add compound index on Job(currency, status) to efficiently support
-- the market-filtered open jobs listing query (localOpenWhere).
-- CONCURRENTLY avoids locking the table during migration.
CREATE INDEX CONCURRENTLY IF NOT EXISTS "Job_currency_status_idx" ON "Job"("currency", "status");
