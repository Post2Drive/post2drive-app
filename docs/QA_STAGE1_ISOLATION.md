# QA Isolation and Cleanup Safety — clean-start policy

## Current environment

The previous Railway project and its services were deleted during the clean-start reset on 16 October 2026. The current repository does not assume any deployment, database, cache, domain, or service URL exists. Do not reuse old URLs or environment variables.

## Safety rules

1. Never point the QA runner at production. A separate staging deployment and isolated database must be provisioned intentionally before QA automation is enabled.
2. The QA runner must remain disabled unless `POST2DRIVE_QA_MODE=true`, `POST2DRIVE_QA_ENVIRONMENT=staging`, `POST2DRIVE_QA_DATABASE_ISOLATED=true`, a runtime `DEPLOYMENT_ID` matches `POST2DRIVE_QA_ALLOWED_DEPLOYMENT_ID`, and `QA_BASE_URL` is HTTPS with a staging hostname. All of these are required; keep them out of production.
3. Use a high-entropy `QA_RUN_TOKEN` of at least 32 characters. Never log it or expose it in a report or commit.
4. Never copy production records to staging. Seed synthetic records with unique run IDs and preserve run summary/event tables.
5. `scripts/qa/cleanup-inventory.sql` is read-only. Review exact candidates and row counts before any destructive operation. A missing run ID that returns zero rows is not proof the target is clean.
6. Do not delete API timing records based on timestamps alone. Only rows tagged with a validated QA run ID can be confidently attributed to a run.
7. Run Prisma migrations against a fresh disposable PostgreSQL database before enabling any new environment. No live database URL should be placed in `.env.example` or checked into Git.

## Preconditions before a 500-account run

- A separately provisioned staging deployment and independent staging database exist.
- The database target has been verified, and no production connection string is in scope.
- All migrations apply from scratch; TypeScript and production-build checks pass.
- QA flags and the runtime allow-list match the staging deployment only.
- Email and payment providers use sandbox/test credentials or remain disabled.
- The test run has an explicit target, account count, token authorization, and post-run inventory review.

Until these criteria are satisfied, synthetic account creation and cleanup remain disabled.
