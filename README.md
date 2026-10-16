# Post2Drive — UK, India & European Freight and Courier Marketplace

Post2Drive is a two-sided freight and courier marketplace in active development. It is designed for people and businesses that post freight jobs and drivers or transport operators who discover, bid on, and fulfil those jobs.

The product is being built around a unified account: users can post jobs, find jobs, bid, accept work, and manage delivery workflows from the same account, with access and actions determined by their account setup and permissions.

> **Current status:** Clean-start prototype / active development. The previous version had repeatable staging synthetic-test evidence, but that evidence does not certify this rebuilt source. Email verification and payment-provider integration are not verified end to end. This repository should not be represented as an unrestricted, fully launched marketplace.
>
> See [Launch Readiness](docs/LAUNCH_READINESS.md) for the current release gates and verified operational status.

## Clean-start safeguards

- This repository is the new source of truth. Do not connect it to a previous production database or reuse deleted Railway URLs.
- Keep country and currency immutable after signup; GB/GBP, India/INR, and each euro-using European country/EUR market are kept separate on the server.
- Never commit `.env` files, signing keys, API keys, tokens, or database credentials.
- Payment and email integrations remain disabled until their providers and end-to-end verification are configured.
- Destructive QA runs must use an isolated non-production database and explicit authorization; do not copy production data into tests.
- Builds that use Capacitor remote-server mode must provide `CAPACITOR_SERVER_URL` at build time. It must be the deliberate target for that build; no default server URL is embedded.

## Product scope and current capabilities

### Accounts and access
- Email/password registration and login.
- Account types for posters, drivers, and users who need both capabilities.
- NextAuth credentials authentication with JWT sessions.
- Optional email-verification flow using Resend, controlled by configuration. Keep it disabled until the sender domain, delivery, token expiry, single-use behavior, resend cooldown, and protected-action checks have been tested end to end.
- Country-first onboarding for the United Kingdom (GBP), India (INR), all 21 EU euro-area countries, and six additional European euro-using states. Each country has its own currency and local timezone, with server-enforced listing isolation.

### Freight marketplace and job lifecycle
- Create and post freight jobs.
- Discover and search available jobs with filters.
- Edit and cancel jobs.
- Submit bids and review bids.
- Accept a bid and assign a job.
- Track job lifecycle transitions and delivery-related actions.
- Activity history and operational dashboards for visibility into marketplace activity.

### Vehicles, ratings, and administration
- Vehicle records associated with marketplace workflows.
- Ratings and related activity history.
- Admin/operational dashboard capabilities and guarded QA tooling.
- Subscription-related API flows and payment-status tracking.

Feature availability and workflow rules are enforced by the application. The list above describes implemented application areas; it does not mean every external service or every production launch requirement has been verified.

## Subscriptions and commercial rules

The weekly-access commercial model applies to **UK/GB accounts using GBP and supported euro markets using EUR**. India remains separately configured. Euro plans use the same numeric tiers as the UK:

| Plan | UK price | Euro-market price | Access |
| --- | ---: | ---: | --- |
| Individual | £9.99 | €9.99 | One-off 7-day access |
| Fleet: 2–5 vehicles | £16.99 | €16.99 | 7-day access |
| Fleet: 6–15 vehicles | £24.99 | €24.99 | 7-day access |
| Fleet: 16–30 vehicles | £36.99 | €36.99 | 7-day access |
| Fleet: 31–55 vehicles | £49.99 | €49.99 | 7-day access |
| Fleet: 56+ vehicles | Custom | Custom | Contact / custom pricing |

Current rules:
- Paid access starts only after trusted payment confirmation.
- A repeat purchase extends an active subscription from its current expiry rather than replacing the remaining time.
- There is no automatic recurring billing in the current model.
- There is no per-job fee in the current model.
- One access period is 7 × 24 hours from activation or renewal. All tiers include unlimited legitimate marketplace activity and no per-job charges.
- UK launch promotion, tester invitations, and referral rules remain UK-only; euro markets use the same base weekly plan tiers.
- These changes establish product pricing logic, not a live checkout. Do not accept real payments until a provider is integrated and settlement/webhook flows are validated.

### Payment integration status

The application has a provider-neutral subscription-payment record and confirmation boundary. This is **not the same as a live payment-provider integration**. Production does not currently have a selected provider and verified provider credentials configured.

Before accepting real subscription payments, select a provider and implement/test its authenticated webhook or signature verification, event idempotency and replay handling, success/failure/cancellation/refund paths, and reconciliation. The confirmation boundary must not be treated as proof of settlement by itself.

## Technology stack

- **Framework:** Next.js 15 App Router
- **Language:** TypeScript
- **UI:** React 18
- **Database:** PostgreSQL
- **ORM and migrations:** Prisma 5
- **Authentication:** NextAuth credentials provider with JWT sessions
- **Password hashing:** bcryptjs
- **Optional email:** Resend
- **Hosting/deployment:** A private Railway staging project now contains persistent PostgreSQL and Redis services plus a preconfigured, not-yet-deployed web service. See `docs/RAILWAY_STAGING_SETUP.md` for the current service inventory and URL status.
- **Mobile tooling dependencies:** Capacitor Android tooling is present in the project dependencies

## Local development

### Requirements
- Node.js version compatible with the project's Next.js/TypeScript dependencies.
- npm.
- A local or development PostgreSQL database.

### Setup

1. Clone the repository and enter the project directory.

   ```bash
   git clone https://github.com/Post2Drive/post2drive-app.git
   cd post2drive-app
   ```

   The repository is public. Keep all environment secrets out of commits and configure only the credentials needed for a development environment.

2. Install dependencies.

   ```bash
   npm ci
   ```

3. Create your local environment file.

   ```bash
   cp .env.example .env
   ```

4. Set `DATABASE_URL` to your development PostgreSQL database and set `NEXTAUTH_SECRET` to a strong random secret. Keep real secrets in local environment variables or the deployment secret manager—never commit them.

5. Apply the existing Prisma migrations.

   ```bash
   npx prisma migrate deploy --schema=prisma/schema.prisma
   ```

   For local schema development when creating new migrations, use:

   ```bash
   npx prisma migrate dev --schema=prisma/schema.prisma
   ```

6. Start the development server.

   ```bash
   npm run dev
   ```

7. Open [http://localhost:3000](http://localhost:3000).

### Useful commands

| Command | Purpose |
| --- | --- |
| `npm run dev` | Start the Next.js development server |
| `npm run build` | Generate the Prisma client and build the app |
| `npm start` | Start the production Next.js server |
| `npx tsc --noEmit` | Run TypeScript type checking |
| `npx prisma migrate deploy --schema=prisma/schema.prisma` | Apply committed migrations |
| `npm run qa:lifecycle-contract` | Run lifecycle, incident, and market-isolation regression guards |
| `npm run qa:market-timezone` | Run UK GMT/BST, India IST, and daylight-saving edge-case tests |
| `node scripts/qa/reliability-budget.mjs` | Verify reliability confidence-bound calculations |

Run the timezone and lifecycle contract checks, Prisma migration checks, TypeScript check, and production build before proposing a release. Review the scripts in `package.json` before adding or changing commands.

## Environment variables

Start from `.env.example`. Values below describe configuration intent; use real values only in local development or the deployment platform's secret-variable settings.

| Variable | Purpose | Guidance |
| --- | --- | --- |
| `DATABASE_URL` | PostgreSQL connection string | Use the correct database/schema for the environment |
| `NEXTAUTH_SECRET` | Signs/authenticates NextAuth session tokens | Generate a strong random value |
| `NEXTAUTH_URL` | Canonical application URL | Use the local URL in development and canonical HTTPS URL in production |
| `EMAIL_VERIFICATION_ENABLED` | Feature flag for email verification | Keep `false` until the complete email flow is verified |
| `RESEND_API_KEY` | Resend API credential | Store as a secret; never commit it |
| `EMAIL_FROM` | Verified sender address | Must belong to a verified Resend sending domain |
| `SUBSCRIPTION_WEBHOOK_SECRET` | Secret for the provider-neutral confirmation boundary | Not a substitute for provider signature verification |
| `POST2DRIVE_ADMIN_EMAILS` | Admin email allowlist | Limit to explicitly authorized operators |
| `POST2DRIVE_TESTER_CODE` | Optional private tester code | Keep private and rotate when needed |

### Email verification setup

Email verification uses Resend and stores SHA-256 hashes of one-time verification tokens. Links expire after 24 hours, and resend requests have a 60-second cooldown.

Before enabling the flow in production:
1. Verify a sending domain with Resend.
2. Configure `RESEND_API_KEY`, `EMAIL_FROM`, and the canonical `NEXTAUTH_URL`.
3. Test real inbox delivery.
4. Verify expiry and single-use token behavior, resend cooldown, generic responses for unknown addresses, and that unverified users cannot perform protected actions.
5. Only then set `EMAIL_VERIFICATION_ENABLED=true`.

## Deployment and environments

This repository is a clean-start rebuild. A private `Post2Drive Staging` Railway project now has a persistent PostgreSQL database, a persistent Redis service, and a preconfigured web service with a reserved test hostname. The web service is still empty and has no deployment because the complete source bundle has not been pushed to GitHub yet. See `docs/RAILWAY_STAGING_SETUP.md` for service IDs and the current URL state. The previous Railway project and old repository were retired during the reset; do not reuse their credentials or infrastructure.

Before creating a new deployment:

1. Create a fresh PostgreSQL database dedicated to this project and environment. Do not import the retired database or its credentials.
2. Configure secrets in the new host's secret manager, never in source control.
3. Run Prisma migrations against the intended development/test database first; review generated SQL and rollback implications before production.
4. Deploy a non-production environment and verify signup, account-market isolation, job creation/search, bids, lifecycle transitions, incident evidence, notifications and account deletion.
5. Only after launch gates pass should a production environment be created and promoted.

Do not configure Android remote-server mode until a deliberate non-production HTTPS deployment exists. `CAPACITOR_SERVER_URL` must be provided explicitly at build time; there is no default URL embedded in the app.

## QA, staging, and data safety

The project includes a synthetic QA runner and guarded cleanup. Keep QA mode and destructive cleanup disabled unless the target is a newly provisioned, isolated non-production database.

The latest recorded launch-readiness review documented ten staging runs with 500 synthetic accounts each, and 5,457 of 5,457 checks passing per run. The tests exercised API workflows including authentication, accounts, jobs, bids, vehicles, ratings, subscription-related API paths, and job lifecycle transitions.

These results are useful repeatable synthetic-test evidence, but they are **not** browser-based usability tests, real email delivery tests, real payment-settlement tests, or proof of a one-in-a-million failure rate. See [Launch Readiness](docs/LAUNCH_READINESS.md) for limitations and the latest release gates.

Safety rules:
- Never run destructive QA cleanup against production.
- Keep `POST2DRIVE_QA_MODE` and `QA_ALLOW_CLEANUP` disabled and `QA_RUN_TOKEN` empty/unset in production.
- Do not bypass exact-target cleanup guards.
- Verify the environment and database schema before any cleanup or risky migration.
- Confirm an independent backup and a tested restore process before production data cleanup or risky changes.

## Before public launch

The marketplace core is not yet cleared for unrestricted public launch. Complete these gates first:

- **Email/account security:** configure and verify real email delivery, token expiry/single-use behavior, resend cooldown, protected actions, and the admin allowlist.
- **Payments:** select a provider and verify authenticated provider events, idempotency/replay handling, refunds and failures, and payment-to-database reconciliation.
- **Real user testing:** test browser and mobile workflows for registration/login, responsive layouts, job posting/search/editing, bids, acceptance, pickup, delivery confirmation/rejection, cancellation, ratings, and admin functions.
- **Operational readiness:** verify backups/restores, monitoring, alerting, incident ownership, rollback, and release notes.
- **Legal and marketplace policies:** publish and review Terms of Service, Privacy Notice, applicable cookie/analytics disclosures, support contact, data retention/deletion procedures, and UK GDPR handling.
- **UK marketplace operations:** confirm eligibility and verification wording, dispute handling, and any applicable insurance/document checks before onboarding real carriers.
- **Domain and HTTPS:** verify the public hostname and HTTPS redirects. A branded custom domain is recommended before marketing.

The next appropriate step is a controlled internal or closed beta after the required gates are addressed—not an unrestricted public launch.

## Security

- Never commit `.env` files, production URLs containing credentials, API keys, webhook secrets, or other private credentials.
- Use separate secrets per environment and store them only in the chosen deployment provider’s secret-variable settings.
- Keep admin access limited to explicitly authorized addresses.
- Do not use production for synthetic QA or destructive cleanup.
- Review [Launch Readiness](docs/LAUNCH_READINESS.md) before deployments that affect authentication, subscriptions, job lifecycle state, or data cleanup.

## Contributing and change discipline

Before proposing changes:
1. Understand the current workflow and relevant tests.
2. Preserve the agreed commercial model unless the product decision is explicitly changed.
3. Add or update tests for lifecycle, authorization, payment, and data-integrity behavior where applicable.
4. Run the build and TypeScript checks.
5. Review environment-specific behavior, migrations, and rollback implications.
6. Update this README and [Launch Readiness](docs/LAUNCH_READINESS.md) when product capabilities or release status materially change.

## Project status

Post2Drive is in active development. Its core marketplace workflows and staging synthetic QA have meaningful implementation and test coverage, while real email verification, live subscription payments, browser/mobile usability, and other launch gates still require explicit verification.

For the current evidence and outstanding release requirements, see [docs/LAUNCH_READINESS.md](docs/LAUNCH_READINESS.md).
