# Import the prepared application source

**Canonical app repository:** https://github.com/Post2Drive/post2drive-app  
**Current state:** GitHub contains bootstrap documentation. The full application source bundle has not yet been uploaded.

The prepared ZIP is available from the current ChatGPT conversation as post2drive-clean-start.zip. Verify the ZIP integrity and inspect the staged Git changes before publishing.

## Windows PowerShell

1. Extract post2drive-clean-start.zip into C:\Projects\post2drive-source. It contains a top-level freight-app-main directory.
2. Clone the existing repository, preserving the status commit already on main:

   ```powershell
   git clone https://github.com/Post2Drive/post2drive-app.git C:\Projects\post2drive-app
   ```

3. Copy the source tree into the clone. Do not use /MIR, which may delete repository-only import notes.

   ```powershell
   robocopy C:\Projects\post2drive-source\freight-app-main C:\Projects\post2drive-app /E /XD node_modules .next /XF .env
   Set-Location C:\Projects\post2drive-app
   ```

   Review the Robocopy summary; exit codes 0–7 generally indicate the copy completed without fatal error.

4. Stage and inspect the changes before committing:

   ```powershell
   git status --short
   git add -A
   git diff --cached --stat
   git status --short
   ```

   Ensure no .env, provider secrets, signing keys/keystores, database dumps, personal data, node_modules, .next, or APK/AAB build outputs are staged.

5. Commit and push without force:

   ```powershell
   git commit -m "chore: establish clean Post2Drive source baseline"
   git push origin main
   ```

   If the remote has changed since cloning, fetch and reconcile the changes before pushing. Never force-push.

## Validation and Railway

The first source push should trigger the Validate workflow. Do not connect Railway until the complete source is in Git and CI validates dependency installation, Prisma migrations, TypeScript and the Next.js build. Then configure only staging secrets and an isolated non-production database in the private Post2Drive Staging project.

Railway project ID: 074d55f7-6a58-4c46-86aa-a2c7b0079859  
Staging environment ID: 293eb264-dd1d-4eef-87ca-016943459edf

The staging project has no service, database, deployment, or public domain at this time. Do not deploy production or attach live credentials as a shortcut.
