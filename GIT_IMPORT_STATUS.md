# Clean-start source import status

**Repository:** [Post2Drive/post2drive-app](https://github.com/Post2Drive/post2drive-app)  
**Purpose:** Canonical application code repository  
**Status:** Bootstrap metadata only; the application source bundle has not yet been pushed.

## Prepared source bundle

The prepared local clean-start bundle is named post2drive-clean-start.zip. At the time this status file was written, its SHA-256 was:

    54e49721a8d1fc2e6c192d5999f1c2092def8dc7b09de5b62a4a2e44c55d2b21

The archive contains the Next.js/TypeScript app and docs, without .env, node_modules, .next, APK/AAB packages, or local build outputs. Recompute the checksum if the source bundle is rebuilt.

## Verified targeted checks

- Market/country/currency isolation contract test — pass.
- UK/India timezone conversion and DST edge-case tests — pass.
- Lifecycle contract regression checks — pass.
- Reliability-budget calculation check — pass.
- ZIP integrity and exclusion checks — pass.

These targeted checks are not a substitute for CI. The full dependency install, Prisma migration validation, TypeScript check, and Next.js production build are still pending.

## Railway staging

A private Railway project named **Post2Drive Staging** has been created with a dedicated staging environment. The project currently has no services, volumes, buckets, or environment variables.

- Railway project ID: 074d55f7-6a58-4c46-86aa-a2c7b0079859
- Staging environment ID: 293eb264-dd1d-4eef-87ca-016943459edf

Do not create a service or trigger a deployment from this repository until the full source baseline is present and validation has passed. Use staging-only credentials and a dedicated non-production PostgreSQL database.

## Initial source import

The source archive is a clean source tree and does not carry Git history. Because this repository now contains this status commit on main, follow the updated docs/PUBLISH_CLEAN_START.md instructions to merge origin/main with --allow-unrelated-histories after creating the local baseline commit, then push without force.

Do not force-push. Do not put secrets or production data into the repository.
