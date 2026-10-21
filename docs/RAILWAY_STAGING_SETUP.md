# Railway staging setup and current state

**Last checked: 18 October 2026**

## Railway project and services

- Project: `Post2Drive Staging` (private project)
- Project ID: `074d55f7-6a58-4c46-86aa-a2c7b0079859`
- Environment: `staging`
- Environment ID: `293eb264-dd1d-4eef-87ca-016943459edf`

| Service | ID | Purpose | Current status |
|---|---|---|---|
| `Postgres` | `4fb4f66a-9869-4976-bc29-217efe0104f4` | Separate PostgreSQL service; contents and consumers not verified | Live, 500 MB persistent volume; do not delete/repoint pending a data audit |
| `Redis` | `47efbd4e-f432-4fa1-91eb-a809c26d9f80` | Removed from active staging service use because no runtime consumer was found | Service removed; 500 MB volume `redis-volume` (`8a301634-90d4-457f-8259-f71bdfdbe5fb`) retained detached |
| `Post2Drive Web` | `561c5355-867e-49fc-84bf-e519e1ac8ef0` | Next.js marketplace + embedded operations dashboard, port 3000, health path `/api/health`; repository `Post2Drive/post2drive-app`, branch `feature/country-localisation-audit` | Commit `b15e0ff754860c564db6fc26930a024d85234938` and the configuration redeploy after clearing the unused Redis reference both succeeded |
| `Post2Drive Infra Smoke Test` | `04107a5c-3b23-4d89-8864-af75355530a3` | Stale display name: actual start command is `npm run qa:worker`; durable QA worker, no public domain | Live; worker startup confirmed in Railway logs |

### Staging URL

`https://post2drive-web-staging.up.railway.app`

The Railway domain targets port 3000 and the marketplace is deployed. The configuration redeploy after clearing the unused Redis reference completed successfully: build compiled, Prisma pre-deploy reported no pending migrations, Next.js started, and Railway marked the deployment `SUCCESS`. This is staging only and does not authorize a production launch.

## QA worker service (currently mislabelled in Railway)

Railway service `Post2Drive Infra Smoke Test` (`04107a5c-3b23-4d89-8864-af75355530a3`) actually runs `npm run qa:worker`, is connected to the same `feature/country-localisation-audit` source revision, and has no public domain. Logs confirm that the PostgreSQL-backed QA worker started. Rename this service in the Railway dashboard to `Post2Drive QA Worker` when convenient; do not mistake it for the previous HTTP smoke-test service.

| Service | ID | Purpose / state |
|---|---|---|
| `Post2Drive Web` | `561c5355-867e-49fc-84bf-e519e1ac8ef0` | Next.js marketplace + embedded operations dashboard; repository `Post2Drive/post2drive-app`, branch `feature/country-localisation-audit`; port 3000; health path `/api/health`. Commit `b15e0ff754860c564db6fc26930a024d85234938` and the subsequent configuration redeploy after clearing the unused Redis reference completed successfully; build, Prisma pre-deploy and Next.js startup passed. |
| `Postgres-J8xl` | `ef2d67df-d9c9-4851-bb12-0728cf40c5da` | Current app/QA database service; 500 MB persistent volume. |
| `Postgres` | `4fb4f66a-9869-4976-bc29-217efe0104f4` | Separate PostgreSQL service and separate 500 MB persistent volume; data owner/consumer not yet verified. Do not delete or repoint it until audited. |
| `Post2Drive Infra Smoke Test` | `04107a5c-3b23-4d89-8864-af75355530a3` | **Actually runs `npm run qa:worker`**; it is a durable QA worker, not an HTTP smoke-test service. It has no public domain and its display name is stale. Rename it in Railway when convenient. |

The `Post2Drive Web` service currently has these live staging settings:

- Builder: Railpack
- Build command: `npm run build`
- Start command: `npm run start`
- Pre-deploy command: `npx prisma migrate deploy`
- Healthcheck: `/api/health` (added to the prepared source bundle)
- Restart policy: `ON_FAILURE`, up to five retries
- Effective `DATABASE_URL`, as confirmed by the latest Prisma pre-deploy logs, resolves to database `post2drive_qa` on `postgres-j8xl.railway.internal`. Railway's connected configuration tool redacts the live variable value, so verify the reference expression in the Railway UI before changing it; do not infer the database target from the service label alone.
- `REDIS_URL` was blanked on the web and QA-worker services; no Redis runtime consumer was found in the inspected app, dashboard, rate limiter or worker.
- `NEXTAUTH_URL` points to the staging URL; `NEXTAUTH_SECRET` is a strong staging-only secret
- `NODE_ENV=production`, `PORT=3000`, `DEPLOYMENT_ENVIRONMENT=staging`, `NEXT_TELEMETRY_DISABLED=1`
- `EMAIL_VERIFICATION_ENABLED=false` to permit isolated staging signup without an email-provider key. This is for testing only; do not copy to production.


The web pre-deploy command recorded at the last check was `node ops-dashboard/provision-readonly-role.mjs && npx prisma migrate deploy`. The provisioning script changes database role permissions; never execute it without explicit approval. The dashboard uses a separate `OPS_DASHBOARD_DATABASE_URL`; its effective target was not readable through the connected Railway interface. Verify it in Railway and confirm it targets `post2drive_qa` using `post2drive_ops_readonly`. Never replace it with primary application credentials. The source-only hardening in `fix/admin-dashboard-readonly-boundary` makes the dashboard verify its connected role and privileges at startup and, when `DEPLOYMENT_ENVIRONMENT=staging`, fail closed unless the database is `post2drive_qa`. This check is effective only after that source revision is deployed; it does not prove the current live setting is correct.

The latest previously successful web deployment's Prisma logs identify:

## QA worker safety and configuration

The QA endpoint enqueues work in the PostgreSQL-backed `qa_test_runs` ledger; the web request does not execute the load test. The existing private staging worker must run the same validated source revision as the web service and use the same isolated staging database. Maintain the explicit staging allow-list and ensure the worker has no public domain.

The existing worker uses Node.js 22.6 or newer, build command `npm ci && npx prisma generate --schema=prisma/schema.prisma`, and start command `npm run qa:worker`. Configure/verify these staging-only settings:

## Redis finding

No Redis client dependency was found in `package.json`, and no Redis usage was found in the inspected operations dashboard, rate limiter, QA worker, or QA-runner paths. The dashboard's 30-second cache is a process-local `Map`; the QA queue uses PostgreSQL. Redis was not improving current application cache, queue or latency behaviour. It was removed as an active service while its volume was retained to avoid deleting unknown data.

If Redis is reintroduced, implement a specific adapter, test failure behaviour and connection limits, and measure performance before claiming a gain.

## Current URLs

- Marketplace: https://post2drive-web-staging.up.railway.app
- Health: https://post2drive-web-staging.up.railway.app/api/health

- PostgreSQL is required by Prisma and currently stores all app data, including incident evidence bytes.
- Redis has been removed from active staging use because no Redis client dependency or runtime consumer was found. Its persistent volume remains detached and retained, not deleted. The dashboard cache is a process-local `Map`; the QA queue uses PostgreSQL. Do not claim Redis improves performance unless a future adapter is implemented, tested and measured.
- An S3-compatible bucket is not needed by the current source because evidence content is stored in PostgreSQL. Revisit object storage only as part of a designed upload migration.
- Email uses Resend only when a real API key and verified sender are provided; do not invent credentials.
- A payment provider adapter, verified webhook settlement, and refund/reconciliation flow are not implemented; never accept live payments.

## Staging verification and release steps

1. Confirm Railway reports the Web and QA worker online with no pending changes. Verify the successful web deployment on commit `b15e0ff754860c564db6fc26930a024d85234938`, `GET /api/health`, and `GET /admin-access/api/metrics`.
2. Check GitHub Actions on the exact proposed commit; a successful Railway deployment is not a substitute for CI or full end-to-end testing.
3. Verify `OPS_DASHBOARD_DATABASE_URL` in Railway without copying or exposing its value. Confirm it targets `post2drive_qa` on `Postgres-J8xl` with the restricted `post2drive_ops_readonly` role. After the read-only-boundary fix is deployed, require the startup log to report that the boundary was verified; startup must fail if the role has write privileges, role memberships, sequence privileges, elevated attributes, or the staging database name is wrong. The admin metrics route returned HTTP 200 after the earlier redeploy, but correctness and warning-free report contents should still be checked.
4. Keep the second PostgreSQL service `Postgres` untouched until its schemas/data and all connection consumers are audited and a backup/restore decision is recorded.
5. Test staging only with synthetic data: signup/login, UK/India separation, job posting/search, bidding/acceptance, delivery transitions, cancellation/incidents/evidence, notifications and account deletion.
6. Keep email and payment integrations blocked until real provider, signature, idempotency/replay, refund/failure and delivery tests pass.
7. Preserve historical deployment failures and QA records. Recheck current route-level 5xx metrics; do not clear the previous 5xx issue solely because the latest deployment succeeded.

## Outstanding checks

- Verify the effective `OPS_DASHBOARD_DATABASE_URL` target and fetch a report with the read-only role.
- Audit tables/data and consumers of the separate `Postgres` service before deciding whether to keep it.
- Rename `Post2Drive Infra Smoke Test` to `Post2Drive QA Worker` in Railway.
- Check route-level 5xx metrics after the successful redeploy and confirm the operations-dashboard report data is correct.
- Reconcile the currently deployed branch with `main` through normal review; PR #12 remains draft and unmerged.
