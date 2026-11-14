/**
 * Runs once when the server starts (not during the build).
 *
 * Production fails closed: if a required setting is missing or a test switch
 * is on, the server refuses to start, the platform health check fails and the
 * previous healthy version keeps serving. Other environments only log.
 * Variable names are logged; values never are.
 */
export async function register() {
  if (process.env.NEXT_RUNTIME !== "nodejs") return;
  const { getProviderReadiness, productionConfigProblems, isProductionEnvironment } = await import("./lib/providerReadiness.ts");

  const report = getProviderReadiness();
  console.log("Provider readiness.", report);

  const problems = productionConfigProblems();
  if (isProductionEnvironment(process.env)) {
    if (problems.length > 0) {
      console.error("Production configuration is invalid; refusing to start.", { problems });
      throw new Error("Production configuration is invalid.");
    }
    return;
  }
  if (problems.length > 0) {
    console.warn("Not production-ready yet (informational outside production).", { count: problems.length, problems });
  }
}
