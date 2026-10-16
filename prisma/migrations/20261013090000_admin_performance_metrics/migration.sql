CREATE TABLE IF NOT EXISTS "ApiRequestMetric" (
  "id" TEXT NOT NULL,
  "method" TEXT NOT NULL,
  "route" TEXT NOT NULL,
  "statusCode" INTEGER NOT NULL,
  "durationMs" INTEGER NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ApiRequestMetric_pkey" PRIMARY KEY ("id")
);
CREATE INDEX IF NOT EXISTS "ApiRequestMetric_createdAt_idx" ON "ApiRequestMetric"("createdAt");
CREATE INDEX IF NOT EXISTS "ApiRequestMetric_route_createdAt_idx" ON "ApiRequestMetric"("route","createdAt");
CREATE INDEX IF NOT EXISTS "ApiRequestMetric_statusCode_createdAt_idx" ON "ApiRequestMetric"("statusCode","createdAt");

-- Make synthetic QA run logs and account mappings available in clean environments too.
CREATE TABLE IF NOT EXISTS qa_test_runs (
  id TEXT PRIMARY KEY,
  target_url TEXT NOT NULL,
  target_accounts INTEGER NOT NULL,
  status TEXT NOT NULL DEFAULT 'running',
  started_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  finished_at TIMESTAMPTZ,
  created_accounts INTEGER NOT NULL DEFAULT 0,
  successful_checks INTEGER NOT NULL DEFAULT 0,
  failed_checks INTEGER NOT NULL DEFAULT 0,
  duration_ms BIGINT,
  summary JSONB NOT NULL DEFAULT '{}'::jsonb
);
CREATE TABLE IF NOT EXISTS qa_test_events (
  id BIGSERIAL PRIMARY KEY,
  run_id TEXT NOT NULL REFERENCES qa_test_runs(id),
  account_index INTEGER,
  account_id TEXT,
  cohort TEXT,
  scenario TEXT NOT NULL,
  action TEXT NOT NULL,
  method TEXT,
  path TEXT,
  expected_statuses INTEGER[] NOT NULL DEFAULT '{}',
  actual_status INTEGER,
  passed BOOLEAN NOT NULL,
  duration_ms INTEGER,
  details JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS qa_test_events_run_idx ON qa_test_events(run_id,id);
CREATE INDEX IF NOT EXISTS qa_test_events_path_idx ON qa_test_events(path,created_at);
CREATE TABLE IF NOT EXISTS qa_test_accounts (
  run_id TEXT NOT NULL REFERENCES qa_test_runs(id),
  account_id TEXT NOT NULL,
  email TEXT NOT NULL,
  cohort TEXT NOT NULL,
  account_index INTEGER NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  PRIMARY KEY(run_id,account_id),
  UNIQUE(run_id,account_index)
);
