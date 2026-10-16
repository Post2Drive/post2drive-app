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

  const base = process.env.QA_BASE_URL?.trim();
  if (!base) return false;
  try {
    const url = new URL(base);
    if (url.protocol !== "https:") return false;
    if (!/(^|[-.])staging([-.]|$)/i.test(url.hostname)) return false;
  } catch {
    return false;
  }
  return true;
}
