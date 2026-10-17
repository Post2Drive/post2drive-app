# Deploying the Post2Drive Ops Dashboard

This is a separate internal reporting service. It is not the customer-facing app dashboard and must not share customer-login assumptions.

## Railway staging configuration

Create a separate service named **Post2Drive Analytics Dashboard** in the existing **Post2Drive Staging** project, scoped only to the staging environment.

- Repository: `Post2Drive/post2drive-app`
- Branch: `feature/country-localisation-audit`
- Root directory: repository root
- Build command: `npm ci && npx prisma generate --schema=prisma/schema.prisma`
- Start command: `npm run ops:dashboard`
- Healthcheck path: `/health`
- Port: Railway-provided `PORT` (the server binds to `0.0.0.0`)
- Restart policy: always

The service runs its own small HTTP server and reads aggregate data from the existing Prisma/PostgreSQL schema. It does not serve the Next.js customer app.

## Required environment variables

Set these as Railway service secrets, never commit them or paste them into chat:

- `DATABASE_URL`: connection string for a **dedicated least-privilege read-only database role**. It must be able to SELECT only the required reporting tables/views. Do not reuse a privileged application owner connection for the public-facing analytics service.
- `OPS_DASHBOARD_USERNAME`: dedicated admin username of at least 3 characters. Do not reuse a customer login.
- `OPS_DASHBOARD_PASSWORD`: strong random admin password of at least 16 characters.
- `OPS_DASHBOARD_SESSION_SECRET`: independent random secret of at least 32 characters.
- `NODE_ENV=production` for Secure cookies.

Do not deploy with a blank/default password or with a database role that can modify marketplace or QA data. If a read-only database role is not yet available, stop before deployment and provision one through the authorised database administration process.

## Access and network

- The dashboard has a dedicated admin username/password, signed HttpOnly session cookie, SameSite=Strict, no-store responses and a restrictive content security policy. It is dashboard-only and does not use customer signup, login, jobs or marketplace pages.
- Do not disable authentication to make the dashboard easier to open.
- Keep the public domain private to authorised operators where Railway access controls or an approved access gateway are available. If a public domain is enabled, the operator password remains mandatory.
- Use HTTPS in deployed environments. No secrets, emails, contact details or individual account rows are rendered in charts.
- Query endpoints are read-only. The service does not run migrations or cleanup operations.

## Data and limitations

First-party account, job, bid, vehicle, API telemetry and QA-history metrics are sourced from PostgreSQL. Synthetic QA accounts are excluded from business totals where the QA attribution table is available. QA runs and failed scenarios remain visible in a separate section. If a query/table is unavailable, the UI must surface a coverage warning.

The country selector filters first-party data by the poster/account country; it does not mutate account country or currency. Job metrics are attributed to the posting account's country. This is a product analytics convention, not a representation of national freight-market size.

The industry section currently provides official source links and platform-derived directional signals. It does **not** yet ingest external national freight volumes, industry revenue, fuel-price time series, regulatory feeds or competitor datasets. Those indicators must not be displayed as live numerical values until a documented source integration, refresh cadence, licensing review and data-quality check are implemented.

## QA and release gates

Before allowing operators to rely on the dashboard:

1. Create/provision the dedicated read-only database role.
2. Configure secrets in Railway staging.
3. Confirm `/health` returns HTTP 200 without exposing configuration.
4. Confirm unauthenticated requests to `/` show the operator access screen and `/api/metrics` returns 401.
5. Confirm an invalid password is rejected and a valid password establishes a secure session.
6. Validate Global, GB, IN and at least one additional country filter against controlled records; confirm countries never bleed across the filter.
7. Reconcile account/user/job/bid totals to documented SQL and exclude QA synthetic accounts from business totals.
8. Confirm QA runs and failed scenario evidence remain read-only and intact.
9. Validate API latency/error aggregations and label missing instrumentation as a coverage gap.
10. Confirm source links and freshness metadata; do not represent source-directory links as imported data.
11. Run `npm run qa:ops-dashboard`, `node --check ops-dashboard/server.mjs`, all existing QA contracts, and the staging deployment smoke test.
12. Keep PR #12 draft and do not deploy production until separately approved.
