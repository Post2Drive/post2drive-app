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

## 10. Verified staging deployment record — 26 October 2026

This is a point-in-time record from Railway's staging environment, not a production release. Recheck the live platform before every release.

- Project/environment: `Post2Drive Staging` / `staging`.
- Web service: `Post2Drive Web`, online; latest successful deployment created **25 October 2026 20:44 UTC**, deployment `12c1fa62-e47a-480c-b585-9153fc379c91`, source branch `integration/pr12-pr41-resolved`, commit `ebe1d7b442b99b5f94a22f4a15802644dd382bdc`.
- QA worker: service still named `Post2Drive Infra Smoke Test`, online; latest successful deployment created **25 October 2026 20:44 UTC**, deployment `0973bb81-2d62-4253-afe5-4da48d4a9bb5`, same branch and commit as Web. It runs `npm run qa:worker`; it is not a public smoke-test endpoint.
- PostgreSQL services: `Postgres-J8xl` and `Postgres` both report online; their latest successful deployments were created **16 October 2026 21:34 UTC** and **16 October 2026 17:17 UTC**, respectively. `Postgres-J8xl` is the historically observed app database; the second service's data and consumers remain unverified. Do not remove or repoint either service without a verified consumer inventory and tested backup/restore.
- Staging configuration: Web is connected to `Post2Drive/post2drive-app` branch `integration/pr12-pr41-resolved`, build command `npm run build`, start command `npm run start`, pre-deploy Prisma migration/staging preparation, health path `/api/health`, domain `https://post2drive-web-staging.up.railway.app`.
- Recent deployment history returned by Railway (**50 records**, newest first, at the time of this check; timestamps are UTC):
  | Status | Service | Created | Branch | Commit | Deployment ID |
  | --- | --- | --- | --- | --- | --- |
  | `SUCCESS` | QA worker | 2026-10-25 20:44 UTC | `integration/pr12-pr41-resolved` | `ebe1d7b442b99b5f94a22f4a15802644dd382bdc` | `0973bb81-2d62-4253-afe5-4da48d4a9bb5` |
  | `SUCCESS` | Web | 2026-10-25 20:44 UTC | `integration/pr12-pr41-resolved` | `ebe1d7b442b99b5f94a22f4a15802644dd382bdc` | `12c1fa62-e47a-480c-b585-9153fc379c91` |
  | `REMOVED` | QA worker | 2026-10-25 20:44 UTC | `integration/pr12-pr41-resolved` | `b9547ef8be7920014d4cd6b5e8d8ef428a646d8e` | `a5346858-9081-4799-904c-7ccb9e8f367f` |
  | `REMOVED` | Web | 2026-10-25 20:44 UTC | `integration/pr12-pr41-resolved` | `b9547ef8be7920014d4cd6b5e8d8ef428a646d8e` | `52584d37-51ea-497d-b3af-256975fdb66f` |
  | `REMOVED` | QA worker | 2026-10-25 19:44 UTC | `integration/pr12-pr41-resolved` | `0d03572d14121a0fa2f8e39f43949feec091fdd0` | `1a4d2691-d702-4d1f-a4d3-8983beed8232` |
  | `REMOVED` | Web | 2026-10-25 19:44 UTC | `integration/pr12-pr41-resolved` | `0d03572d14121a0fa2f8e39f43949feec091fdd0` | `494fca31-2365-4bd4-aa29-eaf1d4da24ec` |
  | `REMOVED` | Web | 2026-10-25 19:44 UTC | `integration/pr12-pr41-resolved` | `aaa4ac7c223ed6274466cfd4dd71f177d56aba0f` | `d6e5fdd4-8580-4440-ba48-5ac106f33f2c` |
  | `REMOVED` | QA worker | 2026-10-25 19:44 UTC | `integration/pr12-pr41-resolved` | `aaa4ac7c223ed6274466cfd4dd71f177d56aba0f` | `16ccd611-ba59-4266-9e64-99d5affdcf8e` |
  | `REMOVED` | Web | 2026-10-25 19:12 UTC | `integration/pr12-pr41-resolved` | `7d56eba854a7a3e7705ac636c670e0aa157d9b74` | `e45b27de-a072-48f9-885f-a0e561162007` |
  | `REMOVED` | QA worker | 2026-10-25 19:12 UTC | `integration/pr12-pr41-resolved` | `7d56eba854a7a3e7705ac636c670e0aa157d9b74` | `d8b54748-4583-4827-bbae-358ee0beed2a` |
  | `REMOVED` | Web | 2026-10-25 19:12 UTC | `integration/pr12-pr41-resolved` | `0eb12fb664c52bb10462432b77c13ad89a7c353d` | `99eff8ab-4d2c-4f19-85ae-13e2fe8549d9` |
  | `REMOVED` | QA worker | 2026-10-25 19:12 UTC | `integration/pr12-pr41-resolved` | `0eb12fb664c52bb10462432b77c13ad89a7c353d` | `32802f5a-64a5-4567-9a10-3c5616bdc271` |
  | `REMOVED` | Web | 2026-10-25 19:05 UTC | `integration/pr12-pr41-resolved` | `64988fabe789de193310c6fe6a4ed2a2233258c0` | `94bd75a0-8502-4334-a7a6-cb7a058fb6b1` |
  | `REMOVED` | QA worker | 2026-10-25 19:05 UTC | `integration/pr12-pr41-resolved` | `64988fabe789de193310c6fe6a4ed2a2233258c0` | `90c549b5-d8a3-4dec-9ef5-25c91b30fc59` |
  | `REMOVED` | QA worker | 2026-10-25 18:57 UTC | `integration/pr12-pr41-resolved` | `8dfa0f6824637af9e452f6532f96880dece1bf1f` | `b0f6088e-4c1d-4697-9b7e-72bd4a2b5403` |
  | `REMOVED` | Web | 2026-10-25 18:57 UTC | `integration/pr12-pr41-resolved` | `8dfa0f6824637af9e452f6532f96880dece1bf1f` | `548493ca-8eb4-4d57-85ee-91469b7b999a` |
  | `REMOVED` | Web | 2026-10-25 18:32 UTC | `integration/pr12-pr41-resolved` | `4d4a7482067442add236647a699b4cb9f347a413` | `b184ac77-f0c5-40c6-ba51-15bffdddd24d` |
  | `REMOVED` | Web | 2026-10-25 17:40 UTC | `integration/pr12-pr41-resolved` | `4d4a7482067442add236647a699b4cb9f347a413` | `a506f161-6244-435f-9b0b-4995cd33a67a` |
  | `REMOVED` | QA worker | 2026-10-25 17:28 UTC | `integration/pr12-pr41-resolved` | `4d4a7482067442add236647a699b4cb9f347a413` | `5ca20a4b-0fcb-4d25-8e10-5c4efd07c8d7` |
  | `REMOVED` | QA worker | 2026-10-25 17:25 UTC | `integration/pr12-pr41-resolved` | `405809850f616616eb3e85ecb538d64a283b8532` | `7c9fd92f-4c02-4eed-8727-06090fc36ee4` |
  | `REMOVED` | QA worker | 2026-10-25 17:24 UTC | `integration/pr12-pr41-resolved` | `505995b052c577adf12df04215afd7838b8f3e4a` | `8842e6f1-de3d-4264-8862-7fb0ecddafb4` |
  | `REMOVED` | QA worker | 2026-10-25 17:23 UTC | `integration/pr12-pr41-resolved` | `2e9087833cff3325f2dee4b26ed5a73e19407864` | `6aab0c84-3173-42d7-abaf-06667865c3d8` |
  | `REMOVED` | QA worker | 2026-10-25 17:23 UTC | `integration/pr12-pr41-resolved` | `f98aab3f63a66aa90e4e87a82f56158f5d1f64f9` | `d0d8674d-aec0-4e4c-ac7e-1a950ec34709` |
  | `REMOVED` | QA worker | 2026-10-25 17:23 UTC | `integration/pr12-pr41-resolved` | `7605507bbbc7c7d5fba04ce9888ba1ed716fc569` | `01a6ce80-b1b1-4c30-8be6-2089dc0cccaf` |
  | `REMOVED` | QA worker | 2026-10-25 17:22 UTC | `integration/pr12-pr41-resolved` | `5055e4681852d7426cd3f0457c6905d96142261d` | `3a976b83-e65a-4339-977e-59df22f92ea1` |
  | `REMOVED` | QA worker | 2026-10-25 17:22 UTC | `integration/pr12-pr41-resolved` | `2a77b02380f5e298c41801ba81d2920ba751b625` | `119a144d-c2e7-4608-93da-3f60de4e5526` |
  | `REMOVED` | QA worker | 2026-10-25 17:19 UTC | `integration/pr12-pr41-resolved` | `09e90fcb802c1088a7d886d9f149035355197d99` | `00d36fd1-c425-48ba-bd3d-a3373ac6b904` |
  | `REMOVED` | QA worker | 2026-10-25 17:06 UTC | `integration/pr12-pr41-resolved` | `aef887334cdb0a0a41e32ef43e9f181d3ae7d73d` | `99080c62-7690-4745-8696-1cb38dd74fe4` |
  | `REMOVED` | QA worker | 2026-10-25 17:01 UTC | `integration/pr12-pr41-resolved` | `2cc726e9ff43768da92e395462fe5e10a6410a28` | `f89c639b-58ed-4efd-b56d-3a94137f9a9a` |
  | `REMOVED` | QA worker | 2026-10-21 00:08 UTC | `feature/country-localisation-audit` | `4e58a373cf408fb232db994fda8b217977767928` | `5bd62b5f-a943-464f-89d4-92cc51aff310` |
  | `REMOVED` | Web | 2026-10-21 00:08 UTC | `feature/country-localisation-audit` | `4e58a373cf408fb232db994fda8b217977767928` | `c49a17ca-2f3d-4f72-8e09-1da705cae01b` |
  | `REMOVED` | QA worker | 2026-10-19 19:44 UTC | `feature/country-localisation-audit` | `566284c6ebdfd44e5d5af9d416258c21c84010a9` | `237c8e04-646b-4959-b1a9-624a6a167221` |
  | `REMOVED` | Web | 2026-10-19 19:44 UTC | `feature/country-localisation-audit` | `566284c6ebdfd44e5d5af9d416258c21c84010a9` | `f2755518-bfd5-4b18-9803-1e6fbbd5c800` |
  | `REMOVED` | Web | 2026-10-19 18:00 UTC | `feature/country-localisation-audit` | `4571b5f5c833eb2cec28356f095fecaff6180e68` | `d8a2db08-ba18-4ba4-870a-031a989ec9b0` |
  | `REMOVED` | QA worker | 2026-10-19 18:00 UTC | `feature/country-localisation-audit` | `4571b5f5c833eb2cec28356f095fecaff6180e68` | `49a96b55-01e9-411f-83cd-8ef1032aeb48` |
  | `FAILED` | Web | 2026-10-18 23:49 UTC | `feature/country-localisation-audit` | `96e1f1288249894866bab2f50e7445205de668ea` | `2f60a58f-5c51-4e3f-91ea-5fa65452c2c8` |
  | `REMOVED` | QA worker | 2026-10-18 23:49 UTC | `feature/country-localisation-audit` | `96e1f1288249894866bab2f50e7445205de668ea` | `b422d2a6-e6f9-44ad-a922-e4eb90b00b5e` |
  | `REMOVED` | QA worker | 2026-10-18 22:03 UTC | `feature/country-localisation-audit` | `1b2041a97d8b4d2b6d5704972080809ebc20c000` | `324fcf15-c21f-416e-b38e-0012ae699482` |
  | `REMOVED` | Web | 2026-10-18 22:03 UTC | `feature/country-localisation-audit` | `1b2041a97d8b4d2b6d5704972080809ebc20c000` | `ac8bf958-23cc-4ca1-908b-7fc2a1b5a745` |
  | `REMOVED` | Web | 2026-10-18 21:40 UTC | `feature/country-localisation-audit` | `b5e5e3361925f219d4da876bbc8d67ec424c4d99` | `302c53f6-33c2-4f6b-845f-62f041e0f157` |
  | `REMOVED` | QA worker | 2026-10-18 21:40 UTC | `feature/country-localisation-audit` | `b5e5e3361925f219d4da876bbc8d67ec424c4d99` | `5bc765ef-b747-436e-b2f4-5ab9b1587f86` |
  | `REMOVED` | Web | 2026-10-18 21:20 UTC | `feature/country-localisation-audit` | `4f29996585311a47df93cf7d04163cd3cef9ab3f` | `f1a2c6f6-df8b-48e5-98a3-31b2134b82fa` |
  | `REMOVED` | QA worker | 2026-10-18 21:20 UTC | `feature/country-localisation-audit` | `4f29996585311a47df93cf7d04163cd3cef9ab3f` | `3d1c7288-e3bd-4418-800f-0fb3f3ab6367` |
  | `REMOVED` | QA worker | 2026-10-18 20:57 UTC | `feature/country-localisation-audit` | `33e313bd7d1ab568cf810c83a2d49bfd7d66b01d` | `951e4944-4b83-48b7-94f9-1e623c32359e` |
  | `REMOVED` | Web | 2026-10-18 20:57 UTC | `feature/country-localisation-audit` | `33e313bd7d1ab568cf810c83a2d49bfd7d66b01d` | `50f9e29f-a66d-4631-bcf9-398deeb66f1f` |
  | `REMOVED` | Web | 2026-10-18 20:42 UTC | `feature/country-localisation-audit` | `ecfa88b4f32b6784ef44a9f4cb9a52aed8ff37fb` | `175f2c22-ff7a-4c8c-ad13-053d0bfffebc` |
  | `REMOVED` | QA worker | 2026-10-18 20:42 UTC | `feature/country-localisation-audit` | `ecfa88b4f32b6784ef44a9f4cb9a52aed8ff37fb` | `ac8beef1-1e80-4c02-8c55-0a371d1665cf` |
  | `REMOVED` | Web | 2026-10-18 19:59 UTC | `feature/country-localisation-audit` | `f78566f50200badc11608a75a47393a5252fe71f` | `2dec0e1e-a60f-4c81-ba6e-a7f3a20b1eb5` |
  | `REMOVED` | QA worker | 2026-10-18 19:59 UTC | `feature/country-localisation-audit` | `f78566f50200badc11608a75a47393a5252fe71f` | `91ae4195-3bc7-4969-aaf0-de758019df9d` |
  | `REMOVED` | QA worker | 2026-10-18 19:39 UTC | `feature/country-localisation-audit` | `c69da117ba833e68766862d47da1313f71684855` | `1fe8f729-7552-455c-a9c0-2ad9bdd484f7` |

  This is the full set returned by the current Railway history query (limit 50), not a guaranteed lifetime export if the platform has older records beyond this window. Export the full Railway deployment history before any compliance/audit requirement that needs every historical deployment. Removed deployments are history only, not rollback guarantees.
- Environment snapshot: all four services reported online, zero active warnings/critical alerts and no pending Railway changes at the time checked. This is platform status, not proof every user journey works.
- GitHub release candidate: PR #73 head `caae14c7a9350cf5335bd9b06d59633b3a27d175` is documentation-only and is **not deployed**. At the observation time, Validate was pending, Android Capacitor build was in progress, and CodeQL/Security Scan had succeeded. No combined commit statuses were returned. Do not describe checks as fully passed until the exact head finishes and results are rechecked.
- Release decision: staging only; no production deployment approved. Keep public launch blocked pending exact-head CI, live browser/mobile E2E, email/payment evidence, database ownership and read-only dashboard DB verification, backup/restore, rollback/recovery, monitoring and legal readiness.
