# Repository portability, ownership continuity and deployment runbook

**Purpose:** This file must travel with a downloaded ZIP, clone, fork or ownership transfer. It records how to rebuild Post2Drive without relying on chat history or a single repository/hosting owner.

## 1. Source of truth and current state

- Canonical repository observed for this document: `Post2Drive/post2drive-app`, public GitHub repository, default branch `main`.
- Application: Next.js App Router / TypeScript / React, Prisma ORM, PostgreSQL, NextAuth credentials/JWT, optional Resend email, Capacitor Android tooling.
- Railway staging has previously been documented as project `Post2Drive Staging`; its current service/configuration must be checked in Railway before acting. The source README and `docs/LAUNCH_READINESS.md` contain dated observations, not guarantees of current runtime state.
- Staging is not production and the app is not cleared for unrestricted public launch. Real payment settlement, end-to-end email, browser/mobile E2E, backup/restore, rollback/recovery and other release gates must be proven before launch.
- Do not assume a branch or commit is deployed because it exists on GitHub. Record the exact commit SHA reported by the deployment platform.
- Product verification/fee rules in `docs/PRODUCT_AND_VERIFICATION_POLICY.md` are intended policy, not proof of implementation.

## 2. Keep an independent source copy

Maintain at least one independent recovery copy under an owner-controlled GitHub account or organisation distinct from the primary owner. Prefer a private mirror if it contains operational details; the canonical app repository may remain public. A mirror must not contain secrets or production data.

### Routine mirror procedure

1. Confirm the canonical repository and default branch with the current owner.
2. Clone all branches/tags from the canonical repository and push to an independent repository you control. Use GitHub's documented repository-import/mirror procedure or a local bare mirror.
3. Verify commit hashes, tags, default branch, releases, issues/PRs needed for continuity, GitHub Actions workflows, branch protection/rulesets, required secrets/variables, deploy keys, webhooks, GitHub App installations and collaborator access separately. A Git mirror alone does not copy issues, PRs, Actions secrets, environments, packages, releases metadata, webhooks or permissions.
4. Keep the recovery mirror updated after reviewed releases. Document the last mirrored commit SHA and date in the owner's operational records.
5. Never copy tokens or secret values into the repository, issues or this document.

Example local commands (run in a secure terminal with GitHub authentication already configured):

```bash
git clone --mirror https://github.com/Post2Drive/post2drive-app.git post2drive-app.git
cd post2drive-app.git
git remote add recovery <YOUR-RECOVERY-REPOSITORY-URL>
git push --mirror recovery
```

Replace the placeholder URL with a repository you own. Do not run `git push --mirror` against the canonical repository; it can overwrite/delete refs.

## 3. Ownership change or original repository unavailable

If repository ownership changes, access is removed, or the canonical repo disappears:

1. Verify the change with the owner and confirm which repository/commit is authoritative. Avoid deploying a fork with unknown provenance.
2. Use the independent mirror or a fresh clone of the verified source. Review commit history and compare it with the last known good deployed SHA.
3. Create a new GitHub repository under the continuing owner/organisation if no accessible canonical repo remains. Push the verified source, preserve tags/branches, set the default branch, enable MFA, add at least two trusted maintainers, protect the default branch, require CI checks/reviews, and recreate issue/PR references that are operationally essential.
4. Recreate repository secrets and Actions variables manually in GitHub Settings from the owner's secure records. Never expect secrets to migrate with a Git mirror or fork.
5. Reconnect Railway to the new repository/branch only after reviewing the exact commit and required checks. Keep the old deployment unchanged until a recovery deployment is proven healthy.
6. Record the new repository URL, owner, default branch, deployed SHA, and changes to integrations in this document/operations log through a reviewed PR. Do not write credential values here.

A change of repository owner does not automatically require a new Railway project if the current Railway owner still controls the project and can reconnect source. Conversely, a new Railway project does not require a new GitHub repository if the source remains accessible.

## 4. Railway continuity and redeployment

### Before changing or creating a project

- Inspect Railway account/workspace access, project, environments, services, deployment history, custom domains, variables, volumes, database services and service-to-service references.
- Export/record configuration names and reference relationships securely; do not expose secret values.
- Identify the exact application database and every consumer. Current historical staging notes identify a service called `Postgres-J8xl` as the app DB and a second `Postgres` service with unverified ownership/consumers. Re-check live state before touching either.
- Make an independent database backup and demonstrate restore to a separate test database before any destructive change.
- Do not delete or repoint a database, volume, custom domain or service just to fix repository ownership.

### Connect a recovery source

1. Create/select a Railway project and environment controlled by the continuing owner.
2. Connect the verified GitHub repository and explicit branch/commit.
3. Configure service build/start/pre-deploy commands from the source and existing deployment docs. Typical app commands in this project are `npm run build`, `npm run start`, and reviewed Prisma migrations; do not blindly run migrations on an unknown database.
4. Add the required environment variables from a secure inventory. Generate fresh environment-specific `NEXTAUTH_SECRET` values; configure `NEXTAUTH_URL`, `DATABASE_URL`, email settings and admin allowlists correctly. Do not reuse staging secrets in production.
5. Provision a fresh PostgreSQL database for a clean environment, run `npm ci`, Prisma validation/generation, migrations against the intended database, TypeScript checks, QA contracts and build.
6. Deploy first to a recovery/staging environment. Check `/api/health`, auth, market isolation, job workflows, database writes, logs, email/payment disabled states and browser/mobile flows.
7. Only after review and explicit release approval, switch custom domain/traffic or promote the source. Keep the previous service/database available for rollback until the new environment has been verified and data migration is confirmed.

### Rollback

- Roll back application code to the last known good immutable commit/deployment.
- Database rollback is not automatically safe: use a tested backup/restore or a backwards-compatible migration plan. Never assume reversing a Prisma migration restores deleted data.
- Do not point old code at a new schema or new code at an unverified database.
- Record incident time, prior/new commit SHAs, database state, recovery steps and test results.

## 5. Free and low-cost hosting

“Free access” is not a guarantee of zero operating cost. The app needs a persistent database, application compute, outbound email if enabled, payment-provider services if enabled, and a domain if a branded domain is required. Free-tier limits, sleep/quotas, database retention, bandwidth and policy change; verify current terms at the time of migration.

Preferred order:
1. **GitHub repository + GitHub Actions:** source control can remain public/free under eligible terms; never store secrets in source. Actions usage limits depend on account/repository settings.
2. **Local development:** run Node.js/npm and a local PostgreSQL instance. This is the most controllable no-hosting-cost option, but it is not a continuously available public marketplace.
3. **Free/low-cost app host:** choose only after confirming the current free tier supports Next.js server execution, persistent connections, environment secrets, custom domains, background QA worker requirements and acceptable sleep/usage limits.
4. **Database:** use a supported PostgreSQL free tier only after checking idle suspension, storage/backup, connection limits, data export and restore capability. Never treat a free database as the only copy of user data.
5. **Email:** keep optional email verification disabled until a sender domain/provider is configured and delivery is tested. Free email quotas are not guaranteed.
6. **Payments:** do not enable live payments merely because a host is free. Provider settlement, signature validation, idempotency, refund/reconciliation and legal requirements remain necessary.

Do not automatically create a second public production service just because a free tier exists. First verify the actual ownership/access failure, cost constraints, data portability and recovery target. A free host is acceptable for development/demo if its limitations are documented; do not promise production reliability without evidence.

## 6. Clean checkout and build procedure

Prerequisites: a supported Node.js version, npm, and a development PostgreSQL database.

```bash
git clone https://github.com/Post2Drive/post2drive-app.git
cd post2drive-app
npm ci
cp .env.example .env
# Edit .env locally; never commit it.
npx prisma validate --schema=prisma/schema.prisma
npx prisma generate --schema=prisma/schema.prisma
npx prisma migrate deploy --schema=prisma/schema.prisma
npx tsc --noEmit
npm run qa:market-isolation
npm run qa:market-timezone
npm run qa:lifecycle-contract
npm run build
npm run dev
```

Check `package.json` before relying on a script name; scripts can change. Use only a disposable/local database for local migration tests. Never use production credentials in a local clone or destructive QA.

## 7. Secrets and integration checklist

Create a secure inventory of **names and purposes only** in documentation; keep values in GitHub Actions/Railway secret stores:

- `DATABASE_URL` — database connection for the exact environment.
- `NEXTAUTH_SECRET`, `NEXTAUTH_URL` — auth/session settings per environment.
- `EMAIL_VERIFICATION_ENABLED`, `RESEND_API_KEY`, `EMAIL_FROM` — email feature/provider configuration; keep disabled until end-to-end verified.
- `SUBSCRIPTION_WEBHOOK_SECRET` — internal boundary secret only; not a substitute for provider signature verification.
- `POST2DRIVE_ADMIN_EMAILS`, `POST2DRIVE_TESTER_CODE` — restrict access and never publish secret tester codes.
- `OPS_DASHBOARD_DATABASE_URL` if used — verify it points to the intended database with a genuinely read-only role.
- `CAPACITOR_SERVER_URL` at build time for remote-server mobile builds; set the deliberate target explicitly.
- QA variables must be staging-only, with destructive cleanup disabled in production.

Recreate provider credentials through the provider dashboard and rotate credentials after any ownership/access incident. Do not ask an assistant to print or paste secrets into chat.

## 8. Release checklist (must be evidence-backed)

- [ ] Confirm exact repo, branch and commit SHA; confirm CI on that exact SHA.
- [ ] Review changes, dependency updates and Prisma migrations.
- [ ] Run clean install, Prisma validate/generate, typecheck, QA contracts and production build.
- [ ] Apply migrations only to the correct isolated environment after backup/restore check.
- [ ] Confirm all required secrets exist in the secret manager without disclosing values.
- [ ] Confirm database owner, service consumers, connection pooling and read-only dashboard role.
- [ ] Check health endpoint and startup logs after deploy.
- [ ] Test signup/login, market isolation, job posting/search/bidding/acceptance, delivery lifecycle, vehicles/documents, permissions, mobile/browser UI and account deletion.
- [ ] Test real email delivery and provider payment flows only after integrations are configured; otherwise keep them disabled and mark blocked.
- [ ] Verify monitoring, alerting, backup restore, rollback and incident contacts.
- [ ] Update `docs/LAUNCH_READINESS.md` with date, commit, CI evidence, deployment ID, tests and unresolved blockers.
- [ ] Keep launch blocked until required gates pass. A successful build or health check alone is not launch approval.

## 9. Operational ownership record

Update this section in a reviewed PR after each verified ownership or hosting change. Do not put secret values here.

- Canonical GitHub repo: `Post2Drive/post2drive-app` (observed 26 October 2026).
- Default branch: `main` (observed 26 October 2026).
- Recovery mirror URL/owner: **not recorded yet**.
- Railway project/environment and current deployed commit: **verify in Railway at release time; dated records live in `docs/RAILWAY_STAGING_SETUP.md`**.
- Database backup location and last successful restore test: **not confirmed; release blocker**.
- Production deployment: **not approved/verified by this document**.
