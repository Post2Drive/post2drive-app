# Backup and recovery plan (production)

Status: plan only (16 Nov 2026). Nothing here has been switched on or tested yet; do not claim a restore drill passed until the evidence table at the bottom is filled in. Applies to the new production Railway project, created when the domain arrives. Staging holds test data only and needs no backup.

## What must survive
| Data | Where | Loss impact |
|---|---|---|
| Accounts, jobs, ratings, disputes, audit log, subscription records | Production Postgres | Total: this is the business |
| Proof photos (30-day retention) | Stored with the database | Disputes cannot be judged |
| Secrets and keys (Resend, SMS, Stripe, NextAuth, OTP pepper, Android upload keystore) | Railway variables, GitHub secrets, owner's password manager | Cannot send email or sign users in; losing the Android upload key blocks app updates |
| Source code | GitHub, plus the owner's laptop copy kept in sync | Low: two copies |

## Targets (proposed, owner to confirm)
- Recovery point objective (max data lost): 24 hours at launch, 1 hour once real money or many users are involved.
- Recovery time objective (max time to be back): 4 hours.

## Layers
1. **Railway volume backups on the production Postgres.** Switch on the daily schedule and keep the weekly one; take a manual backup before every migration that drops or rewrites columns. Railway backups live in the same project, so they do not cover losing the account or project.
2. **Outside copy.** A scheduled nightly `pg_dump` (custom format, encrypted) uploaded to storage in a different provider or account (a free-tier object store is enough at pilot size). Keep 7 daily and 4 weekly copies. The encryption key is kept in the owner's password manager, never in the repository.
3. **Point-in-time recovery** is optional at pilot size. Decide at the "plus" step below, when daily loss of up to 24 hours stops being acceptable.
4. **Migrations.** `prisma migrate deploy` runs on deploy; every release that changes the schema takes a manual backup first and has a written rollback (restore, or a forward fix migration).

## Monthly restore test
Backups that have never been restored are assumptions. Once a month, and once before the first real user:
1. Restore the latest outside copy into a new throwaway Postgres (never over production).
2. Run `npx prisma migrate status` against it and a row count on accounts, jobs, ratings.
3. Start the app against it locally and log in as a test account.
4. Record date, backup used, time taken and result in the evidence table, then delete the throwaway database.

## Disaster runbook (short)
- **Bad deploy:** roll back the Railway deployment; if a migration ran, restore the pre-migration backup into a new database and switch `DATABASE_URL` once verified.
- **Data deleted or corrupted:** stop writes (pause the web service), restore the newest good copy into a new database, compare, then switch over.
- **Railway account or project lost:** create a new project from the repository, restore the outside copy, set variables from the password manager, point the domain at the new service.
- **GitHub unavailable:** the laptop copy is a full clone; push to a new remote.

## Owner decisions needed
- Confirm the targets above.
- Pick the outside storage provider and account (separate login from Railway).
- Choose "weekly Railway backups + nightly outside copy" (cheapest, recommended to start) or add point-in-time recovery from day one.

## Evidence (fill in; leave blank until done)
| Date | What was tested | Backup used | Time to restore | Result | By |
|---|---|---|---|---|---|
|  |  |  |  |  |  |
