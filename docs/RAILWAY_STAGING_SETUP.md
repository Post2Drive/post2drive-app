# Railway staging runbook

**Last checked:** 18 October 2026  
**Project:** `Post2Drive Staging` (`074d55f7-6a58-4c46-86aa-a2c7b0079859`)  
**Environment:** `staging` (`293eb264-dd1d-4eef-87ca-016943459edf`)

This runbook reflects the connected Railway configuration and runtime logs, not the older bootstrap plan.

## Service inventory

| Service | ID | Purpose / state |
|---|---|---|
| `Post2Drive Web` | `561c5355-867e-49fc-84bf-e519e1ac8ef0` | Next.js marketplace + embedded operations dashboard; repository `Post2Drive/post2drive-app`, branch `feature/country-localisation-audit`; port 3000; health path `/api/health`. Commit `b15e0ff754860c564db6fc26930a024d85234938` and the subsequent configuration redeploy after clearing the unused Redis reference completed successfully; build, Prisma pre-deploy and Next.js startup passed. |
| `Postgres-J8xl` | `ef2d67df-d9c9-4851-bb12-0728cf40c5da` | Current app/QA database service; 500 MB persistent volume. |
| `Postgres` | `4fb4f66a-9869-4976-bc29-217efe0104f4` | Separate PostgreSQL service and separate 500 MB persistent volume; data owner/consumer not yet verified. Do not delete or repoint it until audited. |
| `Post2Drive Infra Smoke Test` | `04107a5c-3b23-4d89-8864-af75355530a3` | **Actually runs `npm run qa:worker`**; it is a durable QA worker, not an HTTP smoke-test service. It has no public domain and its display name is stale. Rename it in Railway when convenient. |

Redis service `47efbd4e-f432-4fa1-91eb-a809c26d9f80` was removed from active staging service use because no runtime consumer was found. Its 500 MB volume `redis-volume` (`8a301634-90d4-457f-8259-f71bdfdbe5fb`) remains detached and retained; the data volume has not been deleted. `REDIS_URL` was blanked on the web and QA-worker service configurations.

## Database ownership

The latest previously successful web deployment's Prisma logs identify:

- Database: `post2drive_qa`
- Host: `postgres-j8xl.railway.internal:5432`
- Migration result: 21 migrations found; no pending migrations

Therefore `Postgres-J8xl` is the observed active staging database for the deployed app. The separate `Postgres` service has its own data volume. Do not assume replication, identical contents, or emptiness. Before retirement, inspect its schemas and data, review all service references, and preserve any required backup.

The web service runs `node ops-dashboard/provision-readonly-role.mjs && npx prisma migrate deploy` before start. The provisioning script configures `post2drive_ops_readonly` with SELECT-only table permissions on the database named by `DATABASE_URL`. The dashboard uses a separate `OPS_DASHBOARD_DATABASE_URL`. The connected Railway interface redacts variable values, so that URL's actual target could not be independently read. Confirm it points to `post2drive_qa` on `Postgres-J8xl` with the restricted role, then verify a successful report fetch and no permission warnings. Do not replace it with primary database credentials.

## Redis finding

No Redis client dependency was found in `package.json`, and no Redis usage was found in the inspected operations dashboard, rate limiter, QA worker, or QA-runner paths. The dashboard's 30-second cache is a process-local `Map`; the QA queue uses PostgreSQL. Redis was not improving current application cache, queue or latency behaviour. It was removed as an active service while its volume was retained to avoid deleting unknown data.

If Redis is reintroduced, implement a specific adapter, test failure behaviour and connection limits, and measure performance before claiming a gain.

## Current URLs

- Marketplace: https://post2drive-web-staging.up.railway.app
- Health: https://post2drive-web-staging.up.railway.app/api/health

The health route executes PostgreSQL `SELECT 1`; it does not prove every feature, payment/email delivery, or the dashboard's separate read-only connection is healthy. The previously documented public `post2drive-infra-smoke-test-staging.up.railway.app` URL is not part of the current service inventory.

## Release discipline

1. Verify the exact branch and commit running in Railway.
2. Check GitHub Actions on the exact proposed commit; a successful Railway deployment is not a substitute for CI or end-to-end tests.
3. Use synthetic data only. Keep staging and production databases/credentials isolated.
4. Do not enable real payments or email verification until provider signatures, idempotency/replay handling, failure/refund paths and real delivery tests pass.
5. Preserve historical failed deployments and QA attempts. A 17 October staging snapshot showed 555 raw HTTP 5xx responses; 552 were attributed to the intentionally unconfigured verification-start webhook, while three remained unattributed. Recheck current route-level metrics.
6. Keep QA cleanup disabled unless explicitly authorised and the staging allow-list checks pass.
7. Before any database migration or retirement, confirm the exact target, review the migration, and verify backup/restore.
8. Do not promote the feature branch into production without independent review, complete browser/mobile workflows, security and market-isolation tests, recovery testing, and country-specific legal readiness.

## Outstanding checks

- Verify the effective `OPS_DASHBOARD_DATABASE_URL` target and fetch a report with the read-only role.
- Audit tables/data and consumers of the separate `Postgres` service before deciding whether to keep it.
- Rename `Post2Drive Infra Smoke Test` to `Post2Drive QA Worker` in Railway.
- Check route-level 5xx metrics after the successful redeploy and confirm the operations-dashboard report data is correct.
- Reconcile the currently deployed branch with `main` through normal review; PR #12 remains draft and unmerged.
