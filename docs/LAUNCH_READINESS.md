# Post2Drive Launch Readiness — Clean Start

**Review date:** 16 October 2026  
**Repository:** `Post2Drive/post2drive-app`  
**Release posture:** **Not cleared for public launch. Railway staging infrastructure exists, but the web application source is not connected and no app deployment has succeeded.**

## 1. Clean-start state

- The new public repository is the intended source of truth.
- The old `Ganesh0297/freight-app` repository and old Railway project were retired during the reset. Do not reuse their URLs, credentials, databases, volumes or deployment configuration.
- The prior source archive was used as input and has been updated in a local working copy. This is not proof of a successful production build; dependency installation was not completed in the current environment.
- The local lifecycle contract checks and reliability-budget calculations pass. They are static/regression checks, not substitutes for type-checking, a production build, integration tests, browser tests or live payment/email tests.
- A private Railway staging environment is provisioned with persistent PostgreSQL and Redis services, and an empty web service is preconfigured with a reserved staging hostname. No app deployment has succeeded, and no production database, production email sender, or live payment provider is configured.

## 2. Current market and timezone rules

- Supported markets are UK/GB with GBP and `Europe/London`, and India/IN with INR and `Asia/Kolkata`.
- Country/currency must match the authenticated account's stored market. Job listing and job-specific actions enforce the same-market boundary on the server; client-supplied currency is not authoritative.
- Cross-border matching is disabled. Do not enable it without an explicit product and compliance decision.
- Pickup date/time is interpreted in the account's stored market timezone. UK daylight-saving gaps and ambiguous repeated times must be rejected instead of silently shifted.
- Country/currency are immutable after signup; a user wanting another market needs a separate account.

## 3. Required before a first deployment

### A. Source integrity and build

1. Run `npm ci` from the committed lockfile in a clean environment.
2. Run `npm run qa:market-isolation`, `npm run qa:market-timezone`, `npx prisma validate --schema=prisma/schema.prisma` and `npx prisma generate --schema=prisma/schema.prisma`.
3. Run `npx tsc --noEmit`, `npm run qa:lifecycle-contract`, `node scripts/qa/reliability-budget.mjs`, and `npm run build`.
4. Apply every migration to a fresh PostgreSQL database in CI and confirm there is no dependency on prior database state.
5. Check the generated Android wrapper only after a safe non-production HTTPS target exists.

### B. Authentication and account security — BLOCKED

- Set a strong `NEXTAUTH_SECRET` and the correct `NEXTAUTH_URL` for each environment.
- If email verification is enabled, configure a verified sending domain and provider credentials in the secret manager; verify delivery, expiry, single-use tokens, resend throttling, generic responses for unknown addresses, and protected-action enforcement.
- Keep admin allowlists limited to explicitly authorised operators. Never include public tester codes or admin secrets in source control.
- Verify account deletion requests, access revocation and retention/erasure behavior end-to-end.

### C. Payments and commercial rules — BLOCKED

- Do not charge real users until a payment provider is selected and a provider adapter with authentic signature verification, idempotency, replay protection, failure/cancellation/refund handling and reconciliation has been tested.
- The current provider-neutral payment confirmation boundary is not proof of settlement.
- Preserve the existing UK/GBP plan rules unless the owner explicitly changes them: individual £9.99 for 7-day access; fleet £16.99 for 2–5 vehicles, £24.99 for 6–15, £36.99 for 16–30, £49.99 for 31–55, and custom pricing for 56+; no automatic recurring billing and no per-job fee in the current implemented model.
- The free-trial, pay-weekly, pay-as-you-go, monthly and longer-plan combinations discussed for the Instagram market-research poll are research options, not confirmed commercial entitlements. Do not silently implement or advertise them as live plans.

### D. Market isolation and job lifecycle — REQUIRED

Test both markets independently with separate test accounts and currency values. Include positive and negative cases for job creation, list/search, details, edit, bid, bid acceptance, direct acceptance, cancellation, unassignment, pickup, delivery confirmation/rejection, payments, incident reports, updates and evidence upload/download. A UK account must not read or mutate an India job and vice versa, even when a client manipulates request payloads.

### E. QA safety and infrastructure — REQUIRED

- Create a fresh database dedicated to each environment; do not point the app at retired Railway databases or restore their credentials.
- Keep destructive QA cleanup disabled by default. Require an explicit non-production target and authorisation token before cleanup; test rejection against production-like configuration.
- Establish backups and a tested restore process before storing real customer data.
- Configure monitoring, error alerts, database connection limits, rollback steps and release notes before any public launch.

### F. Legal and user-facing readiness — REQUIRED

- Review and publish Terms of Service, Privacy Notice, data retention/deletion policy, support contact, applicable cookie/analytics disclosures and UK GDPR handling.
- Test browser and mobile workflows on real devices: registration, login, onboarding, profile, job posting/search/edit, bidding, acceptance, pickup, delivery, cancellation, incidents/evidence, ratings, notifications and admin review.
- Confirm UK eligibility/verification wording, dispute handling, and any required insurance/document checks before onboarding real carriers.

## 4. Verification evidence currently available

- `npm run qa:lifecycle-contract` — **PASS** in the working copy.
- `npm run qa:market-isolation` — **PASS** in the working copy.
- `npm run qa:market-timezone` — **PASS** in the working copy.
- `node scripts/qa/reliability-budget.mjs` — **PASS** in the working copy.
- Market-guard presence and source structure checks — **PASS** in the working copy.
- TypeScript check and production build — **NOT VERIFIED** because a complete dependency install could not be obtained in this environment. The existing partial `node_modules` directory is not trusted; run `npm ci` in CI or another network-enabled clean environment.
- Railway PostgreSQL and Redis service deployment status — **SUCCEEDED**, with persistent volumes; this does not verify the app.
- App URL `https://post2drive-web-staging.up.railway.app` is reserved but not yet serving the app because the web service has no source/deployment.
- End-to-end email, payment, browser, mobile and deployed-application tests — **NOT RUN**.

## 5. Release decision

**Safe next step:** publish the complete source, pass clean CI, then connect the existing Railway staging web service and test with synthetic data.  
**Not justified:** public production launch, real payment collection, or claiming email verification works end-to-end.

Do not connect the retired production database or recreate old Railway deployment URLs as a shortcut. Use the new repository, new secrets and newly provisioned infrastructure only.
