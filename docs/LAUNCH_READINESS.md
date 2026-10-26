> **Live staging snapshot — 26 October 2026 (replaces older deployment snapshots where they conflict).** Railway reports all four staging services online with no active warnings/critical alerts and no pending environment changes. Web and QA worker are deployed from `integration/pr12-pr41-resolved`, commit `ebe1d7b442b99b5f94a22f4a15802644dd382bdc` (deployment created 25 October 2026 20:44 UTC). Web deployment ID: `12c1fa62-e47a-480c-b585-9153fc379c91`; QA worker deployment ID: `0973bb81-2d62-4253-afe5-4da48d4a9bb5`. The worker service named `Post2Drive Infra Smoke Test` runs `npm run qa:worker`, not an HTTP smoke test. Both PostgreSQL services are online, but the second service's contents/consumers remain unverified. PR #73 documentation head `caae14c7a9350cf5335bd9b06d59633b3a27d175` is not deployed; Validate is pending and Android build is in progress, while CodeQL and Security Scan passed. No production deployment is approved. See the deployment runbook for the deployment IDs, source branch, service config and recent removed-deployment history.

> **Status audit — 25 October 2026.** PR #48 and #49 are merged; documentation PR #47 is merged. The integration candidate now includes PR #44's password-reset email formatting/cooldown fixes, regression assertions, service ownership/recovery notes, and the Android emulator setup fix. On the earlier candidate, Validate, CodeQL and Security Scan passed, while Android smoke failed because the workflow redundantly rewrote animation settings already handled by the emulator action. Those duplicate writes are removed, and Android CI now runs on integration pushes. Required Validate, CodeQL, Security Scan and Android WebView checks must all pass on the latest exact head before staging deployment.
>
> **Railway staging:** Post2Drive Web remains connected to `integration/pr12-pr41-resolved`; the latest successful Web deployment observed remains `4e58a373cf408fb232db994fda8b217977767928` from 21 October. No new Web deployment has been triggered. Deploy only after current-head checks pass, then verify deployment status and health.
>
> **Outstanding release evidence:** issues #45 and #46 remain open for PostgreSQL consumer ownership, backup/restore and rollback/recovery evidence, live staging browser/mobile E2E, and verified transactional-email domain/configuration/delivery. API-specific work remains deferred as directed. Passing CI does not establish live email delivery, deployed browser E2E, successful recovery or launch readiness.
>
# Post2Drive Launch Readiness — Staging Verification

**Review date:** 18 October 2026  
**Repository:** `Post2Drive/post2drive-app`  
**Release posture:** **Not cleared for public launch. The staging web application is deployed from `feature/country-localisation-audit`; its current successful deployment does not waive the remaining production launch gates.**

## 1. Current staging state

- The canonical application repository is `Post2Drive/post2drive-app`. Railway staging is currently connected to branch `feature/country-localisation-audit`, not `main`.
- Railway's latest previously completed web deployment used commit `b15e0ff754860c564db6fc26930a024d85234938` and was marked `SUCCESS`. The app starts on port 3000 and uses `/api/health` as its health check. Railway also shows four recent failed deployment attempts; at least one failure was a syntax error in the operations dashboard followed by health-check failures. The later successful deployment corrected the runtime failure, but keep these events in the audit trail.
- The latest successful web migration log identifies database `post2drive_qa` via `postgres-j8xl.railway.internal`, Railway service `Postgres-J8xl`. This is the observed current staging database for the deployed application.
- A second independent service, `Postgres`, has a separate 500 MB persistent volume. Its contents and consumers have not been verified. Do not delete, migrate, or repoint it until data ownership and all live connection strings (especially `OPS_DASHBOARD_DATABASE_URL`) are checked.
- The operations dashboard is designed to use a dedicated read-only PostgreSQL role. The deployment's pre-deploy script provisions that role on the database referenced by `DATABASE_URL`; because Railway's connected interface redacts environment-variable values, independently confirm that `OPS_DASHBOARD_DATABASE_URL` targets the same intended staging database with that read-only role.
- Redis was unused in the inspected app/dashboard/worker runtime and has been removed as an active staging service. Its volume remains detached and retained. No production data or service has been changed.
- Railway's service still named `Post2Drive Infra Smoke Test` currently runs `npm run qa:worker` and has no public domain. Treat it as the QA worker; the previous public-smoke-test documentation was stale.
- The staging project is not cleared for public launch. Production email delivery, payment settlement, end-to-end browser/mobile flows, operational recovery and market-specific legal checks remain release gates.

## 2. Current market and timezone rules

- Supported markets are UK/GB with GBP and `Europe/London`, and India/IN with INR and `Asia/Kolkata`.
- Country/currency must match the authenticated account's stored market. Job listing and job-specific actions enforce the same-market boundary on the server; client-supplied currency is not authoritative.
- Cross-border matching is disabled. Do not enable it without an explicit product and compliance decision.
- Pickup date/time is interpreted in the account's stored market timezone. UK daylight-saving gaps and ambiguous repeated times must be rejected instead of silently shifted.
- Country/currency are immutable after signup; a user wanting another market needs a separate account.

## 3. Required before any production deployment or public launch

### A. Source integrity and build

1. Run `npm ci` from the committed lockfile in a clean environment.
2. Run `npm run qa:market-isolation`, `npm run qa:market-timezone`, `npx prisma validate --schema=prisma/schema.prisma` and `npx prisma generate --schema=prisma/schema.prisma`.
3. Run `npx tsc --noEmit`, `npm run qa:lifecycle-contract`, `node scripts/qa/reliability-budget.mjs`, and `npm run build`.
4. Apply every migration to a fresh PostgreSQL database in CI and confirm there is no dependency on prior database state.
5. If using the Android wrapper, test its remote-server configuration against the deliberate staging HTTPS URL; do not embed a production URL by default.

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

- Railway Web and QA-worker deployments after the staging documentation reconciliation — **SUCCESS**. The application-code revision inspected was `b15e0ff754860c564db6fc26930a024d85234938` on `feature/country-localisation-audit`; later changes in the staging reconciliation were documentation-only and did not alter runtime code. The Web build, Prisma pre-deploy on `post2drive_qa`, and Next.js startup passed.
- Web process startup and Railway's `/api/health` check — **PASSED** on the previously completed deployment. The health route checks PostgreSQL connectivity only; it does not prove all application workflows or the operations-dashboard read-only connection.
- Prisma migration — **PASSED** on the current app database; the log reported no pending migrations on `post2drive_qa` at `postgres-j8xl.railway.internal`.
- Current app database and QA worker both use PostgreSQL-backed storage/queueing. No Redis runtime integration was found in the package dependencies, dashboard, rate limiter or worker.
- Final successful staging campaign sessions in the 17 October report: **20,000** synthetic accounts; **28,000** API-load checks; **29,914** workflow/E2E checks. Earlier failures remain preserved separately; the final-run counts are not a production failure-rate claim.
- Railway's 24-hour staging report recorded **555 raw HTTP 5xx** responses. The previous report attributed 552 to the deliberately unconfigured verification-start webhook and left three unattributed. Recheck the latest route-level 5xx metrics before clearing the error gate.
- PostgreSQL service `Postgres` — **ownership/contents not verified**. Do not remove it or repoint any service until its contents and connection consumers are reviewed.
- The current draft localisation PR is not merged. Review CI status on the precise proposed head; do not infer GitHub CI success merely from a successful Railway deployment.
- End-to-end real email delivery, real payment settlement/refund flows, full browser/mobile tests, deletion/restore, concurrency/recovery, legal review and public-launch readiness — **NOT CLEARED**.

## 5. Release decision

**Safe next step:** continue staging-only verification, reconcile the unverified PostgreSQL service and read-only dashboard database target, and keep the launch gates below closed until evidence is recorded.

**Not justified:** public production launch, live payment collection, claiming email verification works end-to-end, deleting the second PostgreSQL service, or assuming Redis was improving runtime performance.

Do not connect retired production infrastructure or reuse old credentials. Preserve staging data, failed QA records and deployment evidence. Keep the retained Redis volume until its data-retention decision is made; it is detached from active service use.

