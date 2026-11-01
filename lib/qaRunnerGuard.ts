/**
 * Explicit gate for the destructive 500-account QA runner. It is disabled unless
 * the deployment identifies itself as staging, declares a separate QA database,
 * and its Railway environment ID matches a separately configured allow-list value.
 * Do not set these variables in production.
 */
export function isQaRunnerEnabled(): boolean {
  if (process.env.POST2DRIVE_QA_MODE !== "true") return false;
  if (process.env.POST2DRIVE_QA_ENVIRONMENT !== "staging") return false;
  if (process.env.POST2DRIVE_QA_DATABASE_ISOLATED !== "true") return false;

  const environmentId = process.env.RAILWAY_ENVIRONMENT_ID?.trim();
  const allowedEnvironmentId = process.env.POST2DRIVE_QA_ALLOWED_ENVIRONMENT_ID?.trim();
  if (!environmentId || !allowedEnvironmentId || environmentId !== allowedEnvironmentId) return false;

  return isApprovedStagingOrigin(process.env.QA_BASE_URL);
}

/**
 * The only hosts the QA worker may send authenticated, data-changing requests
 * to. A "contains the word staging" check is not enough: lookalikes such as
 * attacker-staging.example.com or post2drive-web-staging.up.railway.app.evil.example
 * would pass it. Add a new staging origin here (exact match) when one is created.
 */
export const APPROVED_STAGING_ORIGINS: readonly string[] = [
  "https://post2drive-web-staging.up.railway.app",
];

export function isApprovedStagingOrigin(value: string | undefined | null, approved: readonly string[] = APPROVED_STAGING_ORIGINS): boolean {
  const raw = value?.trim();
  if (!raw) return false;
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return false;
  }
  if (url.protocol !== "https:") return false;
  if (url.username || url.password) return false; // no user:pass@host tricks
  if (url.port !== "") return false; // default HTTPS port only
  if ((url.pathname !== "/" && url.pathname !== "") || url.search || url.hash) return false;
  return approved.includes(url.origin.toLowerCase());
}
