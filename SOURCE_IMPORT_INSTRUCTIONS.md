# Import the prepared application source

**Canonical app repository:** https://github.com/Post2Drive/post2drive-app  
**Current state:** GitHub contains bootstrap documentation; the full source bundle still must be pushed.

The current prepared ZIP is named post2drive-clean-start.zip in the ChatGPT conversation. SHA-256:

    19c34528045b717ef5f6e7546f028a884ece41414073ac13c22b51d6b88a91fc

## Windows PowerShell

1. Extract the ZIP into C:\Projects\post2drive-source. It contains a top-level freight-app-main directory.
2. Clone the existing app repository so its bootstrap commits are retained:

   ```powershell
   git clone https://github.com/Post2Drive/post2drive-app.git C:\Projects\post2drive-app
   ```

3. Copy the application source tree into the clone. Do not use /MIR; it may delete repository-only handoff notes.

   ```powershell
   robocopy C:\Projects\post2drive-source\freight-app-main C:\Projects\post2drive-app /E /XD node_modules .next /XF .env
   Set-Location C:\Projects\post2drive-app
   ```

   Review the Robocopy summary; exit codes 0–7 generally indicate the copy completed without a fatal error.

4. Inspect staged files:

   ```powershell
   git status --short
   git add -A
   git diff --cached --stat
   git status --short
   ```

   Ensure .env files, provider secrets, signing keys/keystores, database dumps, personal data, node_modules, .next, APK and AAB outputs are not staged.

5. Commit and push without force:

   ```powershell
   git commit -m "chore: establish clean Post2Drive source baseline"
   git push origin main
   ```

   If the push is rejected because main advanced, fetch and reconcile; do not force-push.

## Required validation before Railway source connection

The prepared source includes a GitHub Actions Validate workflow. Check the actual Actions result for dependency installation, Prisma validation/migrations, TypeScript and production build. Targeted static/contract tests are not enough by themselves.

## Railway staging already provisioned

Private project **Post2Drive Staging**  
Project ID: 074d55f7-6a58-4c46-86aa-a2c7b0079859  
Environment ID: 293eb264-dd1d-4eef-87ca-016943459edf

The project has persistent Postgres and Redis services, a preconfigured web service, and a separate infrastructure-only health check.

- Infrastructure smoke-test page: https://post2drive-infra-smoke-test-staging.up.railway.app
- Infrastructure health endpoint: https://post2drive-infra-smoke-test-staging.up.railway.app/api/health

The health endpoint has been verified with an HTTP 200 POST probe. It returns 200 only if PostgreSQL SELECT 1 and Redis PING both succeed. The page is explicitly labeled as an infrastructure check, not the marketplace app.

- Reserved marketplace URL: https://post2drive-web-staging.up.railway.app

The marketplace hostname is assigned to the web service on port 3000, but it will not serve the app until the source is pushed, CI passes and the existing web service is connected to the app repository in staging.

After the source is pushed and CI passes, connect the existing Post2Drive Web service to Post2Drive/post2drive-app main in the staging environment only. Do not create a duplicate service or connect production.

Email verification is off for isolated staging signup because no email-provider key is configured. Do not use real personal data. Do not enable live payment processing or the destructive QA runner. Redis is provisioned but not yet consumed by app code; do not claim performance gains until it is wired and tested.
