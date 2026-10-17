# Historical guide: publishing the clean-start source

**Status: superseded as of 18 October 2026.** The application source is already in `Post2Drive/post2drive-app`, and Railway staging has a deployed web service. Do not follow the old archive-copy or first-deployment instructions as outstanding work.

This file is retained as history because it records how the repository was bootstrapped. Current operational facts belong in:

- [Repository README](../README.md)
- [Railway staging runbook](RAILWAY_STAGING_SETUP.md)
- [Launch readiness and release gates](LAUNCH_READINESS.md)

## Current staging note

Railway staging currently runs the web application from `feature/country-localisation-audit`, not `main`. The current app database observed in Railway migration logs is `post2drive_qa` on `Postgres-J8xl`. A second PostgreSQL service named `Postgres` is retained pending data-ownership verification.

Redis had no application runtime consumer and has been removed as an active service; its persistent volume is retained detached. The service displayed as `Post2Drive Infra Smoke Test` is configured as a PostgreSQL-backed QA worker and has no public domain.

Keep production untouched, use synthetic data only in staging, and verify the exact deployed commit and CI status before releases. This staging state does not imply public-launch readiness.
