# Clean-start source import status

**Repository:** [Post2Drive/post2drive-app](https://github.com/Post2Drive/post2drive-app)  
**Role:** Canonical application code repository  
**Current Git state:** main contains bootstrap documentation only. The application source has not yet been pushed.  
**Last checked:** 16 October 2026

## Prepared source bundle

The prepared clean-start bundle is named post2drive-clean-start.zip. Its current SHA-256 is:

    aab4be2a40adee186ff29d24e3a53dfa9ff561d4a69c05e739b9c80ef4ca0c8c

The archive contains the Next.js/TypeScript app and docs, excluding .env, node_modules, .next, APK/AAB packages and local build outputs. Recompute the checksum if the source bundle changes.

## Verified targeted checks

- Market/country/currency isolation contract test — pass.
- UK/India timezone conversion and daylight-saving edge-case tests — pass.
- Lifecycle contract regression checks — pass.
- Reliability-budget calculation check — pass.
- ZIP integrity and excluded-artifact checks — pass.

These targeted checks are not a substitute for CI. A complete dependency install, Prisma migration validation, TypeScript check and Next.js production build have not been verified successfully in this environment.

## Railway staging

A private Railway project named **Post2Drive Staging** has a dedicated staging environment. It currently has no services, volumes, buckets, shared variables or deployments.

- Railway project ID: 074d55f7-6a58-4c46-86aa-a2c7b0079859
- Staging environment ID: 293eb264-dd1d-4eef-87ca-016943459edf

Do not create a service or deployment until the full source baseline is pushed and CI passes. Use staging-only credentials and an isolated non-production PostgreSQL database.

## Publishing

Follow [SOURCE_IMPORT_INSTRUCTIONS.md](SOURCE_IMPORT_INSTRUCTIONS.md). Clone the existing repo first and copy the source files into that working tree, so the bootstrap documentation commit is retained. Review the staged file list and secrets before committing. Do not force-push.

Do not put credentials or production data in this repository.
