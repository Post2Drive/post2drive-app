# Clean-start source import and Railway staging status

**Repository:** [Post2Drive/post2drive-app](https://github.com/Post2Drive/post2drive-app)  
**Role:** Canonical application code repository  
**Current Git state:** main contains bootstrap documentation only. The full application source has not yet been pushed.  
**Last checked:** 16 October 2026

## Prepared source bundle

The clean-start bundle is named post2drive-clean-start.zip. Its current SHA-256 is:

    fc7823bb7a47a250307fed91afae9ae63616e9edbc2000c2149a3bfbf8104ba3

The ZIP contains the Next.js/TypeScript app and documentation, including the Railway readiness endpoint and CI contract check, while excluding .env files, node_modules, .next, Android build outputs, APK/AAB packages and signing-key files. Recompute the checksum if the bundle is rebuilt.

## Verified targeted checks

- Market/country/currency isolation contract test — pass.
- UK/India timezone conversion and daylight-saving edge-case tests — pass.
- Lifecycle contract regression checks — pass.
- Reliability-budget calculation check — pass.
- Railway health-endpoint contract check — pass.
- ZIP integrity and excluded-artifact checks — pass.

These targeted checks are not a substitute for CI. A complete dependency install, Prisma migration validation, TypeScript check and Next.js production build have not yet been verified successfully in this environment.

## Railway staging inventory

Private project: **Post2Drive Staging**  
Project ID: 074d55f7-6a58-4c46-86aa-a2c7b0079859  
Environment: staging  
Environment ID: 293eb264-dd1d-4eef-87ca-016943459edf

- Postgres service ID: 4fb4f66a-9869-4976-bc29-217efe0104f4 — deployment succeeded; persistent volume attached.
- Redis service ID: 47efbd4e-f432-4fa1-91eb-a809c26d9f80 — deployment succeeded; persistent volume attached; not yet consumed by the application code.
- Web service ID: 561c5355-867e-49fc-84bf-e519e1ac8ef0 — configured but has no source or deployment.
- Reserved URL: https://post2drive-web-staging.up.railway.app — domain is assigned to web service port 3000, but is not yet serving the application.

The web service is configured for Railpack, npm run build, npx prisma migrate deploy, npm run start, and /api/health. Its database and Redis settings use Railway private-service variable references. A staging-only NextAuth secret is configured; no live email or payment credentials are configured.

## Publish and deploy sequence

1. Follow SOURCE_IMPORT_INSTRUCTIONS.md to copy the complete ZIP contents into a clone of this repository, retaining the status commit and without force-pushing.
2. Review staged paths for secrets, build outputs, personal data and signing keys. Commit and push the source.
3. Confirm GitHub Actions passes dependency installation, migration validation, TypeScript checks and the Next.js production build.
4. Connect the existing Post2Drive Web service to this repository's main branch in the staging environment only. Do not create a duplicate service or attach production.
5. Confirm migrations, build, the deployment healthcheck and browser requests succeed before inviting testers.

## Safety

- Use synthetic accounts/data only.
- Email verification remains off in staging to allow signup without a configured provider; this is not a production recommendation.
- Do not enable live payments or destructive QA cleanup.
- Do not force-push or connect Railway to the documentation-only branch.
- Do not connect the retired production database or reuse its secrets.
