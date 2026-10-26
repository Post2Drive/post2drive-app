# Post2Drive — Courier, Delivery & Freight Marketplace

Post2Drive is a two-sided marketplace for customers/businesses posting delivery jobs and drivers, couriers and fleet/transport operators discovering, bidding on and fulfilling jobs. It is designed for the UK, India and supported European markets with server-enforced market and currency isolation.

> **Status (26 October 2026):** Active development/staging. Not approved for unrestricted public launch. A past successful build or staging deployment does not prove the latest commit is deployed or launch-ready. See [Launch Readiness](docs/LAUNCH_READINESS.md).

## Essential project documents

These files travel with a clone, source ZIP, fork or ownership transfer. They preserve product intent and recovery steps outside chat history.

- [Application workflows, pricing and dashboards](docs/APP_WORKFLOWS_AND_DASHBOARDS.md) — end-to-end user journeys, poster/driver/fleet dashboards, user analytics, app-owner analytics, admin operations, metric governance and unresolved pricing conflicts.
- [Product, account and verification policy](docs/PRODUCT_AND_VERIFICATION_POLICY.md) — three onboarding steps, role choices, verification fee packages, no-refund and correction windows, the 90-calendar-day return window, active-paid-plan exemptions, company changes, subscription separation and required tests. It describes target policy, not proof every rule is implemented.
- [Analytics Dashboard Product Spec](docs/ANALYTICS_DASHBOARD_PRODUCT_SPEC.md) — internal operations and logistics intelligence dashboard specification; does not itself prove the service is deployed.
- [Repository portability, ownership continuity and deployment runbook](docs/REPOSITORY_PORTABILITY_AND_DEPLOYMENT.md) — independent source mirror, repository ownership changes, clean checkout, deployment recovery, low-cost hosting, rollback and release checklist.
- [Launch Readiness](docs/LAUNCH_READINESS.md) — dated test evidence and outstanding release gates.
- [Railway staging setup](docs/RAILWAY_STAGING_SETUP.md) — dated infrastructure notes; verify live Railway state before changing anything.
- [Vibrant Design System](docs/VIBRANT_DESIGN_SYSTEM.md) — UI palette and component semantics.

## Product model

A single account may post jobs, carry jobs, or do both. Role choice guides onboarding but should not permanently lock a user into one role. Verification, subscription entitlements and role selection are separate.

1. **Step 1 — free registration:** choose post jobs, carry jobs, or both. Registration alone does not grant restricted access.
2. **Step 2 — person and applicable company verification:** required identity/business checks remain mandatory. Driver-only users may skip the Step 2 posting fee and poster subscription, not required checks.
3. **Step 3 — driver and vehicle verification:** verify each vehicle and required MOT/inspection, insurance and other documents. Eligibility is per vehicle.

### Intended GBP verification policy

| Package | Intended fee |
| --- | ---: |
| Step 2: person, with applicable company verification | £2.50 |
| Step 3: person/driver plus first vehicle, including required MOT/insurance checks | £3.50 |
| Additional vehicle during initial verification, where applicable | £0.50 |

No refunds. First failure: 10 working days to submit corrections. Next failure: final 3 working days. Another failure generally requires a new verification fee, subject to the active-paid-plan maintenance exemption. The free inactive-return window is **90 calendar days from successful verification**; checks are free inside it even if documents expired, but the findings still govern eligibility. Active paid users pay no fee for routine rechecks or adding vehicles. Changing the responsible person within the same company is free; a new company relationship incurs the applicable fee. See the complete policy document for edge cases and required tests.

## Commercial rules: do not silently merge conflicting price models

The existing repository's launch-readiness notes describe UK/euro weekly access: individual £9.99 for 7 days; fleet £16.99 (2–5 vehicles), £24.99 (6–15), £36.99 (16–30), £49.99 (31–55), and custom pricing for 56+; no automatic recurring billing and no per-job fee in that documented model. A more recent product discussion proposes poster £9.99/month and driver £9.99/week. These models conflict and need one explicit approved pricing matrix before implementation or advertising. See [Application Workflows and Dashboards](docs/APP_WORKFLOWS_AND_DASHBOARDS.md). Payment records or a provider-neutral confirmation boundary do not prove live payment-provider settlement.

## Technology and capabilities

- Next.js App Router, TypeScript, React
- PostgreSQL and Prisma
- NextAuth credentials/JWT sessions; bcryptjs
- Optional Resend email; Capacitor Android tooling
- Application areas include accounts, market-aware onboarding, job posting/search/edit/cancellation, bidding/acceptance, delivery lifecycle, vehicles/documents, ratings, notifications, incident/evidence flows and guarded QA/admin tools.

These areas do not imply every integration or end-to-end workflow is production-verified.

## Local development

Requirements: compatible Node.js, npm and a development PostgreSQL database.

```bash
git clone https://github.com/Post2Drive/post2drive-app.git
cd post2drive-app
npm ci
cp .env.example .env
# Configure development-only DATABASE_URL and NEXTAUTH_SECRET.
npx prisma validate --schema=prisma/schema.prisma
npx prisma generate --schema=prisma/schema.prisma
npx prisma migrate deploy --schema=prisma/schema.prisma
npx tsc --noEmit
npm run build
npm run dev
```

Open `http://localhost:3000`. Check `package.json` for current QA script names before relying on them. Never use production data for local development or destructive QA.

## Environment and security

Start with `.env.example` and verify names against current source. Environment settings may include `DATABASE_URL`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL`, `EMAIL_VERIFICATION_ENABLED`, `RESEND_API_KEY`, `EMAIL_FROM`, `SUBSCRIPTION_WEBHOOK_SECRET`, `POST2DRIVE_ADMIN_EMAILS`, `POST2DRIVE_TESTER_CODE`, `OPS_DASHBOARD_DATABASE_URL` and build-time `CAPACITOR_SERVER_URL`. These are names only, not secret values or a guarantee of live configuration.

Never commit environment files, tokens, API keys, signing keys, database credentials or production data. Recreate secrets manually after an ownership transfer. Keep email and live payments disabled until providers and end-to-end tests are verified. Separate staging and production databases and credentials.

## Deployment and recovery

- Treat `main` as the default source branch unless deliberately changed; Railway may deploy a different branch. Record the exact deployed commit SHA.
- Review Prisma migrations and confirm the target database before applying them.
- Do not delete/repoint an unknown database, volume or service until data, consumers and backups have been audited.
- Verify health, logs, auth, market isolation, job lifecycle, vehicle eligibility, email/payment state, browser/mobile workflows and database writes after a deployment.
- Code rollback does not restore lost database data; backup/restore must be tested separately.

Use the [portability and deployment runbook](docs/REPOSITORY_PORTABILITY_AND_DEPLOYMENT.md) for mirroring the source, repository-owner changes, reconnecting Railway, low-cost/free-tier considerations, rollback and release checks. A new repository or Railway project is not automatically required just because ownership changes; first confirm what access and resources remain available.

## QA and launch gates

Use synthetic data in isolated non-production environments. Keep destructive cleanup disabled by default. Historical staging load-test figures are not production reliability guarantees or proof of real email/payment functionality.

Before public launch, require evidence for latest-commit CI/security/build checks, auth and email delivery, payment settlement/refund/reconciliation, market isolation and verification enforcement, browser/mobile E2E, database ownership, backup/restore, monitoring, rollback, legal policies and domain/HTTPS. See [Launch Readiness](docs/LAUNCH_READINESS.md) for dated evidence and blockers.

## Change discipline

Inspect the current code, tests and open PRs before changing rules. Keep verification, payment status and feature entitlements separate; preserve server-side market isolation; add regression tests; run checks on the exact proposed commit; update the relevant docs; and do not deploy without review and release approval.
