# Railway staging setup and current state

**Last checked: 16 October 2026**

## Railway project and services

- Project: `Post2Drive Staging` (private project)
- Project ID: `074d55f7-6a58-4c46-86aa-a2c7b0079859`
- Environment: `staging`
- Environment ID: `293eb264-dd1d-4eef-87ca-016943459edf`

| Service | ID | Purpose | Current status |
|---|---|---|---|
| `Postgres` | `4fb4f66a-9869-4976-bc29-217efe0104f4` | Primary transactional database for Prisma | Deployment succeeded; 500 MB persistent volume |
| `Redis` | `47efbd4e-f432-4fa1-91eb-a809c26d9f80` | Staging cache/queue infrastructure reservation | Deployment succeeded; 500 MB persistent volume; app code does not yet use Redis |
| `Post2Drive Web` | `561c5355-867e-49fc-84bf-e519e1ac8ef0` | Next.js marketplace application | Empty service configured; no source or deployment yet |
| `Post2Drive Infra Smoke Test` | `04107a5c-3b23-4d89-8864-af75355530a3` | Temporary infra-only HTTP/status page | Deployment succeeded; public domain assigned; GET health route checks PostgreSQL and Redis |

### Staging URL

`https://post2drive-web-staging.up.railway.app`

The Railway domain is reserved and targets port 3000. **It is not yet a working marketplace URL**: the web service has no application source or deployment, so app testing must wait until the source is published and a deployment succeeds.

## Immediate infrastructure smoke-test URL

`https://post2drive-infra-smoke-test-staging.up.railway.app`

This is a separate small Railway Function deployed successfully to verify platform routing and the two data services. Its home page explicitly says it is an infrastructure check, not the marketplace. `GET /api/health` (also `/health`) runs `SELECT 1` on Postgres and `PING` on Redis, returning HTTP 200 only if both checks pass, and 503 otherwise. It never returns raw errors or credentials. The latest Railway HTTP probe reached this public endpoint and returned HTTP 200 for POST /api/health. That handler only returns 200 when PostgreSQL SELECT 1 and Redis PING both succeed, so this confirms live routing plus connectivity to both services. Browser GET /api/health is also supported.

## Application configuration already set

The `Post2Drive Web` service has these settings ready for the source import:

- Builder: Railpack
- Build command: `npm run build`
- Start command: `npm run start`
- Pre-deploy command: `npx prisma migrate deploy`
- Healthcheck: `/api/health` (added to the prepared source bundle)
- Restart policy: `ON_FAILURE`, up to five retries
- `DATABASE_URL` references `${{Postgres.DATABASE_URL}}` over Railway private networking
- `REDIS_URL` references `${{Redis.REDIS_URL}}`; no code currently consumes this value
- `NEXTAUTH_URL` points to the staging URL; `NEXTAUTH_SECRET` is a strong staging-only secret
- `NODE_ENV=production`, `PORT=3000`, `DEPLOYMENT_ENVIRONMENT=staging`, `NEXT_TELEMETRY_DISABLED=1`
- `EMAIL_VERIFICATION_ENABLED=false` to permit isolated staging signup without an email-provider key. This is for testing only; do not copy to production.

Do not set `POST2DRIVE_QA_MODE=true` unless you are explicitly preparing the isolated, deployment-ID-gated QA runner. Do not set any live payment or email-provider credentials in this environment.

## Separate QA worker service (required before a 10,000-account run)

The QA endpoint now enqueues a run in the PostgreSQL-backed `qa_test_runs` ledger. The web request does not execute the load test. A separate worker must run the same tested source revision and use the same isolated staging database.

Create a private Railway service named `Post2Drive QA Worker` in the **staging** environment. Connect it to the same repository and exact commit used by `Post2Drive Web`; set its start command to `npm run qa:worker`; do not assign it a public domain. Use Node.js 22.6 or newer. Configure these values in the staging environment only:

- `DATABASE_URL`: the same staging Postgres connection as the web service.
- `POST2DRIVE_QA_MODE=true`
- `POST2DRIVE_QA_ENVIRONMENT=staging`
- `POST2DRIVE_QA_DATABASE_ISOLATED=true`
- `RAILWAY_ENVIRONMENT_ID`: Railway's actual ID for the staging environment.
- `POST2DRIVE_QA_ALLOWED_ENVIRONMENT_ID`: the exact same staging environment ID.
- `QA_BASE_URL=https://post2drive-web-staging.up.railway.app`
- `QA_ACCOUNT_COUNT=10000`
- `QA_MARKET_COUNTRY=GB` for a UK run or `IN` for an India run.

The web service requires the same isolation and allow-list settings plus `QA_RUN_TOKEN` (at least 32 characters); the worker does not need that trigger token. Keep cleanup disabled by default. Enable `QA_ALLOW_CLEANUP=true` only for a separately confirmed, explicit cleanup request. Do not set these QA variables in production and do not use a production database.

The queue uses a PostgreSQL advisory lock for unique enqueue and `FOR UPDATE SKIP LOCKED` for atomic worker claim. Worker heartbeats and phase are stored in the run summary. If a worker dies, its row stays `running` with its last heartbeat; it is **not automatically re-queued**, because a replacement could otherwise duplicate account creation while the previous process is still alive. Confirm the previous worker process has stopped before any manual recovery. Clean up only after terminal state, and preserve run results before cleanup.

Deployment gate: the web service and this worker must both be deployed from the same validated commit. Verify the web build, health endpoint, worker startup log, database migration, and the current commit/revision from Railway before submitting the 10,000-account trigger.

## Why no further services are enabled

- PostgreSQL is required by Prisma and currently stores all app data, including incident evidence bytes.
- Redis is provisioned at the user's request but is currently unused by the code. Do not claim it improves performance until an adapter is implemented and tested; avoid routing rate-limit decisions through Redis without preserving the current database-backed safety guarantees.
- An S3-compatible bucket is not needed by the current source because evidence content is stored in PostgreSQL. Revisit object storage only as part of a designed upload migration.
- Email uses Resend only when a real API key and verified sender are provided; do not invent credentials.
- A payment provider adapter, verified webhook settlement, and refund/reconciliation flow are not implemented; never accept live payments.

## Steps to make the app URL live

1. Publish the complete source from `post2drive-clean-start.zip` into `Post2Drive/post2drive-app`, preserving the documentation commits on `main`. Use `docs/PUBLISH_CLEAN_START.md` for instructions.
2. Confirm GitHub Actions validates dependency installation, Prisma schema/migrations, TypeScript, and the Next.js production build. Targeted local contract tests alone are insufficient.
3. Only after CI passes, connect the existing `Post2Drive Web` service to `Post2Drive/post2drive-app` branch `main`, scoped to this `staging` environment. Do not create a second app service or connect any production environment.
4. Wait for `npx prisma migrate deploy`, build, healthcheck, and deployment to pass. The expected health response is `GET /api/health` returning HTTP 200 with `{"status":"ok","service":"post2drive-web","checks":{"database":"ok"}}`.
5. Test using synthetic data only: signup/login, both markets, UK/India boundary checks, DST/timezone handling, job posting/bidding/acceptance, cancellation/incidents/evidence, notifications and account deletion.
6. Email delivery stays off until Resend credentials and a verified sender are configured. Payment collection stays blocked until a real provider adapter and signed-webhook tests exist.

## Safety rules

- The staging domain is publicly reachable after a deployment; use synthetic accounts and data only.
- Do not use production credentials, real personal data, live payment credentials, or production database backups.
- Never force-push or attach Railway to a documentation-only commit.
- Keep production deployment separate and blocked until launch-readiness gates are reviewed.
