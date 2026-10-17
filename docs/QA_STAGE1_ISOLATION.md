# QA Isolation and Cleanup Safety — clean-start policy

## Current environment

A Railway staging project and staging environment now exist for controlled verification. Before each run, re-read the live Railway service/deployment configuration and confirm the staging URL, isolated database, current commit, worker state and environment flags. Never infer these from old notes or use production credentials.

## Safety rules

1. Never point the QA runner at production. A separate staging deployment and isolated database must be provisioned intentionally before QA automation is enabled.
2. The QA runner must remain disabled unless `POST2DRIVE_QA_MODE=true`, `POST2DRIVE_QA_ENVIRONMENT=staging`, `POST2DRIVE_QA_DATABASE_ISOLATED=true`, a runtime `DEPLOYMENT_ID` matches `POST2DRIVE_QA_ALLOWED_DEPLOYMENT_ID`, and `QA_BASE_URL` is HTTPS with a staging hostname. All of these are required; keep them out of production.
3. Use a high-entropy `QA_RUN_TOKEN` of at least 32 characters. Never log it or expose it in a report or commit.
4. Never copy production records to staging. Seed synthetic records with unique run IDs and preserve run summary/event tables.
5. Cleanup is disabled for this campaign: keep `QA_ALLOW_CLEANUP=false`, do not call the cleanup action, and do not delete synthetic accounts, jobs, events, or run rows. Preserve all test data and run summaries for review. `scripts/qa/cleanup-inventory.sql` is read-only; use it only to inspect the staging scope, never as authorization to delete.
6. Do not delete API timing records based on timestamps alone. Only rows tagged with a validated QA run ID can be confidently attributed to a run.
7. Run Prisma migrations against a fresh disposable PostgreSQL database before enabling any new environment. No live database URL should be placed in `.env.example` or checked into Git.

## Preconditions before a 10,000-scale QA run

- A separately provisioned staging deployment and independent staging database exist.
- The database target has been verified, and no production connection string is in scope.
- All migrations apply from scratch; TypeScript and production-build checks pass.
- QA flags and the runtime allow-list match the staging deployment only.
- Email and payment providers use sandbox/test credentials or remain disabled.
- The test run has an explicit target, account count, token authorization, and pre-run read-only inventory review. Run distinct test types, not three repeats of the same workload. Execute in this order, one at a time: (1) `synthetic-accounts` provisions 10,000 accounts and retains them; (2) `api-load` performs 10,000 authenticated read requests using the preserved account pool; (3) `workflow-e2e` exercises marketplace lifecycle/concurrency flows and a 10,000-request route matrix using that same pool. Do not re-provision accounts for the latter two runs. Document the request/event denominator for each test.

Until these criteria are satisfied, synthetic account creation remains disabled. For this campaign, cleanup remains disabled even after a run; preserve the synthetic data and all QA evidence.
