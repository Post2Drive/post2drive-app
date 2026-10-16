/**
 * Explicit gate for the destructive 500-account QA runner. It is disabled unless
 * the deployment identifies itself as staging, declares a separate QA database,
 * and its deployment ID matches a separately configured allow-list value.
 * Do not set these variables in production.
 */
export function isQaRunnerEnabled(): boolean {
  if (process.env.POST2DRIVE_QA_MODE !== "true") return false;
  if (process.env.POST2DRIVE_QA_ENVIRONMENT !== "staging") return false;
  if (process.env.POST2DRIVE_QA_DATABASE_ISOLATED !== "true") return false;

  const deploymentId = process.env.DEPLOYMENT_ID?.trim();
  const allowedDeploymentId = process.env.POST2DRIVE_QA_ALLOWED_DEPLOYMENT_ID?.trim();
  if (!deploymentId || !allowedDeploymentId || deploymentId !== allowedDeploymentId) return false;

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
