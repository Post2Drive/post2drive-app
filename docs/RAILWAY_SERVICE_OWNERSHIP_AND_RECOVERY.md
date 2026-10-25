> **Current staging note — 25 October 2026.** Post2Drive Web is connected to `integration/pr12-pr41-resolved`; the latest successful Web deployment observed remains `4e58a373cf408fb232db994fda8b217977767928` from 21 October. Two PostgreSQL services are present, but their consumers and recovery/restore evidence are not fully verified. Do not infer ownership from service names, alter database services, or claim a restore drill passed without evidence. The latest integration candidate's Validate, CodeQL and Security Scan passed on the preceding SHA; the Android emulator smoke failure was traced to redundant animation-setting writes, which have been removed. Current-head checks must pass before staging deployment.

# Railway staging service ownership and recovery map

Last checked: 2026-10-22. This document records the observed staging topology; it does not claim that either PostgreSQL service has been matched to a connection string unless verified from a live connection.

## Environment

- Project: `Post2Drive Staging`
- Environment: `staging`
- Environment ID: `293eb264-dd1d-4eef-87ca-016943459edf`
- Deployment pause: remains in force. Do not redeploy, restart database services, run migrations manually, detach volumes, or delete resources as part of this inventory.

## Service boxes and responsibilities

| Railway service | Service ID | Observed source / role | Volume | Ownership / action |
|---|---|---|---|---|
| Post2Drive Web | `561c5355-867e-49fc-84bf-e519e1ac8ef0` | `Post2Drive/post2drive-app`, branch `integration/pr12-pr41-resolved`; current live deployment is older than PR #44 | None | Application runtime and the only observed configured Prisma migration entry point: pre-deploy command runs `prisma migrate deploy` then `npm run predeploy:staging`. Candidate E2E waits for authorised deployment. |
| Post2Drive Infra Smoke Test | `04107a5c-3b23-4d89-8864-af75355530a3` | Same repository, branch `feature/country-localisation-audit` | None | Smoke-test/infra validation service. Do not treat it as the app or database migration owner without further evidence. |
| Postgres | `4fb4f66a-9869-4976-bc29-217efe0104f4` | PostgreSQL template image | `postgres-volume` (`5d10d2a7-113e-4204-9b2b-7ef98247ee3e`, 500 MB) | Database purpose and consumers are **unverified**. Do not rename to a purpose-specific label or retire it until live consumers are mapped. |
| Postgres-J8xl | `ef2d67df-d9c9-4851-bb12-0728cf40c5da` | PostgreSQL template image | `postgres-volume-KEiS` (`cd6ccb85-94f7-463b-abbe-b053f3183ff2`, 500 MB) | Database purpose and consumers are **unverified**. Do not rename to a purpose-specific label or retire it until live consumers are mapped. |
| Unattached Redis volume | N/A | No service currently mounted | `redis-volume` (`8a301634-90d4-457f-8259-f71bdfdbe5fb`, 500 MB) | Orphan/unattached by current inventory; retain until its purpose and retention requirements are confirmed. |

## Connection ownership established from code/config names

- `DATABASE_URL`: application Prisma connection. The Web service pre-deploy command runs Prisma migrations, so **Web is the configured migration runner**. This does not identify which physical PostgreSQL service the variable resolves to.
- `OPS_DASHBOARD_DATABASE_URL`: operations dashboard's separate Prisma connection. The dashboard code requires a dedicated `post2drive_ops_readonly` role, verifies it has no write/elevated privileges, and in staging requires the database name `post2drive_qa`.
- `OPS_DASHBOARD_DB_PASSWORD`: used by the repository's explicit read-only-role provisioning script; it is not evidence that provisioning has run successfully against either live service.
- The Railway OAuth integration exposes variable names, not rendered values. Therefore this audit did not inspect or disclose credentials and cannot map either connection URL to a service by hostname.

## Required safe owner-mapping procedure

1. In Railway staging, open **Post2Drive Web → Variables**. Inspect the reference target for `DATABASE_URL` and `OPS_DASHBOARD_DATABASE_URL` in the Railway UI without copying secrets into chat or logs. Record only the referenced service name and database name.
2. Confirm `DATABASE_URL` targets the intended staging application database and that the Web pre-deploy command is the sole migration runner. Do not run migrations manually during the deployment pause.
3. Confirm `OPS_DASHBOARD_DATABASE_URL` resolves to database `post2drive_qa` and role `post2drive_ops_readonly`; verify zero write privileges and no role memberships using the existing dashboard startup check. Do not change grants or passwords until the target is positively identified.
4. For each PostgreSQL service, record its current database name, connection consumers, volume ID, backup schedule/retention, last successful backup, and tested restore reference. Do not include connection strings, passwords, or tokens.
5. Only after the mapping and recovery evidence are approved should the Railway service boxes be renamed to explicit names such as `Post2Drive App DB` and `Post2Drive QA / Ops Read-only DB`. Do not apply these names yet because the physical mapping is not proven.
6. The unattached `redis-volume` must remain untouched until its ownership and retention are established.

## Recovery evidence still missing

The environment inventory shows the two PostgreSQL volumes and their mounts, but it does not prove backup retention, a successful restore, or rollback recovery. Attach timestamped backup evidence and a successful restore-drill record from a safe, isolated target before claiming this gate passed.

## Current release exclusions

Email API/domain delivery, mobile OTP setup, independent review, and the Railway deployment pause are intentionally deferred. They are not reasons to stop the code-level inventory and documentation work above.
