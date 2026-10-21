-- Durable QA campaign definitions. This migration adds metadata only; it does not launch runs,
-- alter existing QA rows, or clean synthetic accounts/history.
CREATE TABLE IF NOT EXISTS qa_test_campaigns (
  id text PRIMARY KEY,
  name text NOT NULL,
  target_environment text NOT NULL DEFAULT 'staging',
  country_code text NOT NULL,
  scenario text NOT NULL,
  total_campaign_tests integer NOT NULL,
  tests_per_variation integer NOT NULL,
  account_count integer NOT NULL,
  concurrency integer NOT NULL,
  suites jsonb NOT NULL DEFAULT '[]'::jsonb,
  variations jsonb NOT NULL DEFAULT '[]'::jsonb,
  execution_mode text NOT NULL DEFAULT 'preview_only',
  status text NOT NULL DEFAULT 'draft',
  created_by text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (target_environment = 'staging'),
  CHECK (total_campaign_tests BETWEEN 1 AND 25000),
  CHECK (tests_per_variation BETWEEN 1 AND 25000),
  CHECK (account_count BETWEEN 1 AND 10000),
  CHECK (concurrency BETWEEN 1 AND 100),
  CHECK (execution_mode = 'preview_only'),
  CHECK (status = 'draft')
);
CREATE INDEX IF NOT EXISTS qa_test_campaigns_created_idx ON qa_test_campaigns(created_at DESC);
