# Publish the clean-start source to `Post2Drive/post2drive-app`

The application source bundle is prepared, but it has **not yet been uploaded as application source**. The GitHub repository contains import/status documentation on `main`, so clone the repository first and copy the source into that working tree. This keeps the remote history and avoids an unrelated-history merge.

## Windows PowerShell

1. Download and extract `post2drive-clean-start.zip` to a temporary folder, for example `C:\Projects\post2drive-source`. The archive contains a top-level `freight-app-main` folder.
2. Clone the existing application repository:

   ```powershell
   git clone https://github.com/Post2Drive/post2drive-app.git C:\Projects\post2drive-app
   ```

3. Copy the contents of the extracted source folder into the clone. This merges the application files while preserving repository-only import notes; do not use `/MIR` because it could delete those notes.

   ```powershell
   robocopy C:\Projects\post2drive-source\freight-app-main C:\Projects\post2drive-app /E /XD node_modules .next /XF .env
   Set-Location C:\Projects\post2drive-app
   ```

   `robocopy` exit codes 0–7 generally indicate that the copy completed without a fatal error. Review its summary.

4. Review and commit the staged source.

   ```powershell
   git status --short
   git add -A
   git diff --cached --stat
   git status --short
   ```

   Confirm that the staged files contain no `.env`, provider secrets, signing keys/keystores, database dumps, personal data, `node_modules`, `.next`, or APK/AAB build artifacts. Then commit and push:

   ```powershell
   git commit -m "chore: establish clean Post2Drive source baseline"
   git push origin main
   ```

   If the remote has changed since the clone, fetch and reconcile before pushing. Do not force-push.

## Before publishing

- Never add `.env`, provider secrets, signing keys, keystores, database dumps or personal data.
- Keep `CAPACITOR_SERVER_URL` unset until a deliberate non-production HTTPS server exists.
- The first source push triggers the `Validate` workflow. Treat the repository as a development baseline until dependency installation, Prisma migration, type-check and production build all pass.

## Railway staging

The private `Post2Drive Staging` Railway project has persistent `Postgres` and `Redis` services, a preconfigured `Post2Drive Web` service, and a separate deployed infra-only smoke-test function. The infra check is at `https://post2drive-infra-smoke-test-staging.up.railway.app` and its `/api/health` endpoint probes Postgres and Redis. It is not the marketplace. The public marketplace hostname `https://post2drive-web-staging.up.railway.app` is reserved, but **the app is not serving there yet** because the web service has no source/deployment. The web service is configured for `npm run build`, `npx prisma migrate deploy`, `npm run start`, and `/api/health`.

After the complete source is pushed and GitHub Actions passes, connect the existing web service to `Post2Drive/post2drive-app` on `main` in the `staging` environment. Do not create a duplicate app service. Follow [`RAILWAY_STAGING_SETUP.md`](RAILWAY_STAGING_SETUP.md), test with synthetic data only, and do not deploy the unverified baseline into production.
