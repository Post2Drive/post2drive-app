-- Keep QA audit metadata tables under migration control rather than relying
-- exclusively on the runner to create them at runtime. Existing tables are left
-- intact; this migration is safe for environments where the runner already made them.
CREATE TABLE IF NOT EXISTS qa_test_runs (
  id text PRIMARY KEY,
  target_url text NOT NULL,
  target_accounts int NOT NULL,
  status text NOT NULL DEFAULT 'running',
  started_at timestamptz NOT NULL DEFAULT now(),
  finished_at timestamptz,
  created_accounts int NOT NULL DEFAULT 0,
  successful_checks int NOT NULL DEFAULT 0,
  failed_checks int NOT NULL DEFAULT 0,
  duration_ms bigint,
  summary jsonb NOT NULL DEFAULT '{}'::jsonb
);

CREATE TABLE IF NOT EXISTS qa_test_events (
  id bigserial PRIMARY KEY,
  run_id text NOT NULL REFERENCES qa_test_runs(id),
  account_index int,
  account_id text,
  cohort text,
  scenario text NOT NULL,
  action text NOT NULL,
  method text,
  path text,
  expected_statuses int[] NOT NULL DEFAULT '{}',
  actual_status int,
  passed boolean NOT NULL,
  duration_ms int,
  details jsonb NOT NULL DEFAULT '{}'::jsonb,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS qa_test_events_run_idx ON qa_test_events(run_id, id);

CREATE TABLE IF NOT EXISTS qa_test_accounts (
  run_id text NOT NULL REFERENCES qa_test_runs(id),
  account_id text NOT NULL,
  email text NOT NULL,
  cohort text NOT NULL,
  account_index int NOT NULL,
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (run_id, account_id),
  UNIQUE (run_id, account_index)
);
