# Post2Drive application repository

This is the canonical repository for the Post2Drive Logistics Network application.

## Current state

This repository currently contains import and staging-status documentation only. The complete application source is prepared separately in post2drive-clean-start.zip, but **has not yet been pushed into this Git repository**. Do not connect Railway to this documentation-only baseline.

- Source import procedure: [SOURCE_IMPORT_INSTRUCTIONS.md](SOURCE_IMPORT_INSTRUCTIONS.md)
- Current source and validation status: [GIT_IMPORT_STATUS.md](GIT_IMPORT_STATUS.md)
- Railway staging procedure and safety gates are documented in the prepared source bundle under docs/RAILWAY_STAGING_SETUP.md.

## Release status

The repository is not deployment-ready. Targeted checks have passed in the prepared source workspace, but the complete dependency installation, Prisma migration checks, TypeScript check and Next.js production build still need to be validated through GitHub Actions after the source is imported.

## Safety

- Never commit .env files, tokens, signing keys, database dumps or personal data.
- Keep staging credentials and data separate from production.
- Do not create a Railway deployment until the full application source has been pushed and CI passes.
- Do not force-push.
