# Post2Drive — Courier, Delivery & Freight Marketplace

Post2Drive is a two-sided marketplace for customers/businesses posting delivery jobs and drivers, couriers and fleet/transport operators discovering, bidding on and fulfilling jobs. Launch markets are the UK and India only (one constant, `LAUNCH_COUNTRY_CODES` in `lib/market.ts`; other catalogue markets are switched off and signup rejects them on the server). Market and currency isolation is enforced server-side.

> **Status (6 November 2026):** Active development/staging. Staging (Railway) deploys automatically from `main`. Not approved for unrestricted public launch. A past successful build or staging deployment does not prove the latest commit is deployed or launch-ready. See [Launch Readiness](docs/LAUNCH_READINESS.md).

## Repository branches

`main` is the source branch. Older work branches and `recovery/` tags are retained but not maintained; see the [branches page](https://github.com/Post2Drive/post2drive-app/branches). Branch and tag clean-up is an owner task (a verified backup bundle of all 133 refs was made on 2026-11-06).

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

One unified account path (owner decision 2026-11-06). Verification, subscription entitlements and role are separate.

1. **Email, then phone OTP** (UK accounts need a verified phone to post or award bids; India is free after phone OTP).
2. **Person identity and company**, with a named responsible person. An account that stops here is a **poster** (post only).
3. **Vehicles and documents**, approved by the admin team (`/admin/vehicles`): 1 vehicle = **driver**, 2–55 = **fleet**. Drivers and fleets can also post. Driver-only users skip only the poster subscription, never a verification step.

Fleet rules: vehicles company-owned or leased and insured on a company commercial policy (hire-and-reward or fleet cover); one verified person drives on one account (licence uniqueness via keyed hash); the driver and vehicle are recorded per job.

### GBP verification fees (implemented; recorded as pending until a payment provider is connected)

| Package | Fee |
| --- | ---: |
| Step 2: person, with applicable company verification | £2.50 |
| Step 3: person/driver plus first vehicle, including required MOT/insurance checks | £3.50 |
| Each additional vehicle, including vehicles added later | £0.50 |

No refunds. Correction deadlines count working days (weekends excluded; UK bank holidays not yet included). First failure: 10 working days to submit corrections. Next failure: final 3 working days. Another failure generally requires a new verification fee, subject to the active-paid-plan maintenance exemption. The free inactive-return window is **90 calendar days from successful verification**; checks are free inside it even if documents expired, but the findings still govern eligibility. Active paid users pay no fee for routine rechecks or adding vehicles. Changing the responsible person within the same company is free; a new company relationship incurs the applicable fee. See the complete policy document for edge cases and required tests.

## Commercial rules

**Approved pricing (owner decision 2026-11-06):** poster £12.99/month (post only); individual driver £14.99 per 7 days (1 person, 1 vehicle, posting included); fleets £24.99 (2–5 vehicles), £39.99 (6–15), £59.99 (16–30), £79.99 (31–55) per 7 days; custom for 56+. One subscription per account; the driver/fleet plan replaces the poster plan. No per-job fees or commission. Same numbers in each non-India market's currency; India free after phone OTP. Source of truth: `lib/pricing.ts`. Launch windows (from the `LaunchConfig` row, UTC dates): Month 0 register and verify only; posters free for 12 months, then a 1-month trial for new posters; drivers free for the first 3 months with a per-postcode-area waitlist, then no trial. Billing moves from monthly to weekly 7 days after the first vehicle approval, with unused monthly days credited; drivers can switch back to poster at the end of the current 7-day period. Full rules: [Product and verification policy §6](docs/PRODUCT_AND_VERIFICATION_POLICY.md). Payment checkout is not connected; no live settlement, and the app says so.

## Technology and capabilities

- Next.js App Router, TypeScript, React
- PostgreSQL and Prisma
- NextAuth credentials/JWT sessions; bcryptjs
- Optional Resend email; Capacitor Android tooling
- Application areas include accounts, market-aware onboarding, job posting/search/edit/cancellation, bidding/acceptance, delivery lifecycle, vehicles/documents and admin vehicle approval, ratings, notifications, incident/evidence flows and guarded QA/admin tools.
- **Ratings:** open only on completed jobs, jobs ended via incident after pickup ("not completed"), or deliveries unconfirmed for 14 days ("disputed"); 14-day blind window, reasons required. Nothing changes job status automatically: pickup is confirmed by either side, delivery by both.
- **Cancellations:** limited to 5 per week and 15 per month per account.
- **Notifications:** every two-party job step tells the other side who acted (e.g. "Pickup confirmed by the driver"); matching jobs alert eligible drivers; reminders 7 days / 1 day / on the day for insurance and MOT expiry, the day before correction deadlines, plan renewal and the end of a free window. Reminders run when a daily scheduler calls `POST /api/internal/notifications/run` (not yet scheduled on Railway).
- **Providers (structure ready, not connected by owner decision):** email, SMS OTP, payments and push notifications plug in through `lib/providerContracts.ts`; see [Provider integration](docs/PROVIDER_INTEGRATION.md).
- **Security:** per-account rate limits on mutating routes; an HTTP isolation matrix in CI (`qa:isolation-api-e2e`) proves accounts and markets cannot read or change each other's data.

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

Start with `.env.example` and verify names against current source. Environment settings may include `DATABASE_URL`, `NEXTAUTH_SECRET`, `NEXTAUTH_URL`, `EMAIL_VERIFICATION_ENABLED`, `RESEND_API_KEY`, `EMAIL_FROM`, `SUBSCRIPTION_WEBHOOK_SECRET`, `POST2DRIVE_ADMIN_EMAILS`, `POST2DRIVE_TESTER_CODE`, `OPS_DASHBOARD_DATABASE_URL`, `POST2DRIVE_LICENCE_HASH_SECRET` (32+ characters, required in production for driver licences), `POST2DRIVE_SCHEDULER_SECRET` (daily reminders trigger), `POST2DRIVE_QA_DATABASE_NAME` (QA worker stays idle unless it names an isolated QA database) and build-time `CAPACITOR_SERVER_URL`. These are names only, not secret values or a guarantee of live configuration.

Never commit environment files, tokens, API keys, signing keys, database credentials or production data. Recreate secrets manually after an ownership transfer. Keep email and live payments disabled until providers and end-to-end tests are verified. Separate staging and production databases and credentials.

## Deployment and recovery

- Treat `main` as the default source branch unless deliberately changed; Railway may deploy a different branch. Record the exact deployed commit SHA.
- Review Prisma migrations and confirm the target database before applying them.
- Do not delete/repoint an unknown database, volume or service until data, consumers and backups have been audited.
- Verify health, logs, auth, market isolation, job lifecycle, vehicle eligibility, email/payment state, browser/mobile workflows and database writes after a deployment.
- Code rollback does not restore lost database data; backup/restore must be tested separately.

Use the [portability and deployment runbook](docs/REPOSITORY_PORTABILITY_AND_DEPLOYMENT.md) for mirroring the source, repository-owner changes, reconnecting Railway, low-cost/free-tier considerations, rollback and release checks. A new repository or Railway project is not automatically required just because ownership changes; first confirm what access and resources remain available.

## QA and launch gates

`npm run qa:all` runs the contract suite; CI additionally runs the database-backed lifecycle and isolation end-to-end tests. Use synthetic data in isolated non-production environments. Keep destructive cleanup disabled by default. Historical staging load-test figures are not production reliability guarantees or proof of real email/payment functionality.

Before public launch, require evidence for latest-commit CI/security/build checks, auth and email delivery, payment settlement/refund/reconciliation, market isolation and verification enforcement, browser/mobile E2E, database ownership, backup/restore, monitoring, rollback, legal policies and domain/HTTPS. See [Launch Readiness](docs/LAUNCH_READINESS.md) for dated evidence and blockers.

## Change discipline

Inspect the current code, tests and open PRs before changing rules. Keep verification, payment status and feature entitlements separate; preserve server-side market isolation; add regression tests; run checks on the exact proposed commit; update the relevant docs; and do not deploy without review and release approval.
