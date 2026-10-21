-- Add sequential campaign execution metadata. Existing QA runs/events/accounts are preserved.
ALTER TABLE qa_test_campaigns DROP CONSTRAINT IF EXISTS qa_test_campaigns_execution_mode_check;
ALTER TABLE qa_test_campaigns DROP CONSTRAINT IF EXISTS qa_test_campaigns_status_check;
ALTER TABLE qa_test_campaigns ADD CONSTRAINT qa_test_campaigns_execution_mode_check CHECK (execution_mode IN ('preview_only','staging_sequential'));
ALTER TABLE qa_test_campaigns ADD CONSTRAINT qa_test_campaigns_status_check CHECK (status IN ('draft','queued','running','completed','failed','aborted'));

CREATE TABLE IF NOT EXISTS qa_test_campaign_steps (
  id text PRIMARY KEY,
  campaign_id text NOT NULL REFERENCES qa_test_campaigns(id) ON DELETE CASCADE,
  ordinal integer NOT NULL,
  variation_id text,
  variation_name text,
  suite text NOT NULL,
  test_type text NOT NULL CHECK (test_type IN ('synthetic-accounts','api-load','workflow-e2e')),
  test_iterations integer NOT NULL CHECK (test_iterations BETWEEN 1 AND 25000),
  account_count integer NOT NULL CHECK (account_count BETWEEN 500 AND 10000),
  concurrency integer NOT NULL CHECK (concurrency BETWEEN 1 AND 100),
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending','queued','running','completed','failed','aborted','skipped')),
  run_id text UNIQUE REFERENCES qa_test_runs(id) ON DELETE SET NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  started_at timestamptz,
  finished_at timestamptz,
  UNIQUE (campaign_id, ordinal)
);
CREATE INDEX IF NOT EXISTS qa_test_campaign_steps_order_idx ON qa_test_campaign_steps(campaign_id, ordinal);
CREATE INDEX IF NOT EXISTS qa_test_campaign_steps_run_idx ON qa_test_campaign_steps(run_id);

-- Campaign correlation is embedded in run summaries so the legacy QA ledger stays authoritative.
