\set ON_ERROR_STOP on
\if :{?run_id}
\else
  \echo 'ERROR: supply a run_id, for example: psql "$DATABASE_URL" -v run_id=20261012131451-c9310c5d -f scripts/qa/cleanup-inventory.sql'
  \quit 2
\endif

-- READ-ONLY inventory only. This file contains no DELETE, UPDATE, TRUNCATE, or DDL.
-- Run against a verified database after checking the target with the operator.
BEGIN READ ONLY;

WITH selected_run AS (
  SELECT id, target_url, target_accounts, status, started_at, finished_at
  FROM qa_test_runs
  WHERE id = :'run_id'
),
qa_accounts AS (
  SELECT q.account_id
  FROM qa_test_accounts q
  JOIN selected_run r ON r.id = q.run_id
),
qa_jobs AS (
  SELECT j.id
  FROM "Job" j
  WHERE j."posterId" IN (SELECT account_id FROM qa_accounts)
     OR j."acceptedById" IN (SELECT account_id FROM qa_accounts)
     OR j.notes LIKE '%QA-' || :'run_id' || '%'
)
SELECT
  r.id AS run_id,
  r.target_url,
  r.target_accounts,
  r.status AS run_status,
  r.started_at,
  r.finished_at,
  (SELECT count(*) FROM qa_test_events e WHERE e.run_id = r.id) AS qa_event_rows,
  (SELECT count(*) FROM qa_test_accounts q WHERE q.run_id = r.id) AS mapped_account_rows,
  (SELECT count(*) FROM qa_accounts) AS mapped_account_ids,
  (SELECT count(*) FROM "Account" a WHERE a.id IN (SELECT account_id FROM qa_accounts)) AS matching_account_rows,
  (SELECT count(*) FROM "User" u WHERE u."accountId" IN (SELECT account_id FROM qa_accounts)) AS user_rows,
  (SELECT count(*) FROM qa_jobs) AS candidate_job_rows,
  (SELECT count(*) FROM "Bid" b WHERE b."bidderId" IN (SELECT account_id FROM qa_accounts) OR b."jobId" IN (SELECT id FROM qa_jobs)) AS candidate_bid_rows,
  (SELECT count(*) FROM "Rating" x WHERE x."raterId" IN (SELECT account_id FROM qa_accounts) OR x."rateeId" IN (SELECT account_id FROM qa_accounts) OR x."jobId" IN (SELECT id FROM qa_jobs)) AS candidate_rating_rows,
  (SELECT count(*) FROM "Vehicle" v WHERE v."accountId" IN (SELECT account_id FROM qa_accounts)) AS candidate_vehicle_rows,
  (SELECT count(*) FROM "JobActivity" a WHERE a."actorId" IN (SELECT account_id FROM qa_accounts) OR a."jobId" IN (SELECT id FROM qa_jobs)) AS candidate_job_activity_rows,
  (SELECT count(*) FROM "DriverOpportunity" o WHERE o."driverId" IN (SELECT account_id FROM qa_accounts) OR o."jobId" IN (SELECT id FROM qa_jobs)) AS candidate_driver_opportunity_rows,
  (SELECT count(*) FROM "PlatformUsageEvent" u WHERE u."accountId" IN (SELECT account_id FROM qa_accounts)) AS candidate_usage_event_rows,
  (SELECT count(*) FROM "SubscriptionPayment" p WHERE p."accountId" IN (SELECT account_id FROM qa_accounts)) AS candidate_subscription_payment_rows,
  (SELECT count(*) FROM "VerificationAttempt" v WHERE v."accountId" IN (SELECT account_id FROM qa_accounts)) AS candidate_verification_attempt_rows,
  (SELECT count(*) FROM "TrialCycle" t WHERE t."accountId" IN (SELECT account_id FROM qa_accounts)) AS candidate_trial_cycle_rows,
  (SELECT count(*) FROM "QualificationSnapshot" q WHERE q."accountId" IN (SELECT account_id FROM qa_accounts)) AS candidate_qualification_snapshot_rows,
  (SELECT count(*) FROM "Referral" f WHERE f."referrerId" IN (SELECT account_id FROM qa_accounts) OR f."referredAccountId" IN (SELECT account_id FROM qa_accounts)) AS candidate_referral_rows,
  (SELECT count(*) FROM "EmailVerificationToken" e JOIN "User" u ON u.id = e."userId" WHERE u."accountId" IN (SELECT account_id FROM qa_accounts)) AS candidate_email_verification_token_rows,
  (SELECT count(*) FROM "PasswordResetToken" p JOIN "User" u ON u.id = p."userId" WHERE u."accountId" IN (SELECT account_id FROM qa_accounts)) AS candidate_password_reset_token_rows,
  (SELECT count(*) FROM qa_test_runs) AS total_qa_run_rows,
  (SELECT count(*) FROM qa_test_accounts) AS total_qa_mapping_rows,
  (SELECT count(*) FROM qa_test_events) AS total_qa_event_rows
FROM selected_run r;

-- A missing run ID returns zero rows above; do not infer that this means cleanup is safe.
-- API request metrics have no run ID today and are intentionally excluded from this inventory.
ROLLBACK;
