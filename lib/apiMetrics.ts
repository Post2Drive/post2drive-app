import { prisma } from "@/lib/prisma";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { checkJobMarket } from "@/lib/jobMarket";
import { isQaRunnerEnabled } from "@/lib/qaRunnerGuard";

type RouteHandler = (...args: any[]) => Promise<Response> | Response;

/**
 * Records privacy-minimised backend timings. Route templates are supplied by
 * the caller so path IDs, emails, query strings and request bodies are never
 * persisted as telemetry dimensions.
 *
 * QA attribution is accepted outside production, or on an explicitly
 * isolated service with POST2DRIVE_QA_MODE=true. Production does not accept
 * client-supplied QA attribution unless that service-level opt-in is set.
 */
export function withApiMetrics<T extends RouteHandler>(routeTemplate: string, handler: T): T {
  const wrapped = async (...args: Parameters<T>) => {
    const startedAt = Date.now();
    let statusCode = 500;
    try {
      // Enforce country/currency isolation centrally for every job-specific API
      // route (details, bidding, lifecycle, payment acknowledgements, incidents,
      // and evidence). Individual handlers still perform role/status checks.
      const request = args[0] as Request | undefined;
      if (request && typeof request.url === "string") {
        const pathname = new URL(request.url).pathname;
        const match = pathname.match(/^\/api\/jobs\/([^/]+)(?:\/|$)/);
        if (match && match[1]) {
          const session = await getServerSession(authOptions);
          const accountId = (session?.user as any)?.accountId as string | undefined;
          if (accountId) {
            const marketCheck = await checkJobMarket(accountId, match[1]);
            if (!marketCheck.ok) {
              const response = NextResponse.json(
                { error: marketCheck.error, code: marketCheck.code },
                { status: marketCheck.status },
              );
              statusCode = response.status;
              return response;
            }
          }
        }
      }

      const response = await handler(...args);
      statusCode = response.status;
      return response;
    } finally {
      const request = args[0] as Request | undefined;
      const isProduction = process.env.NODE_ENV === "production" || process.env.DEPLOYMENT_ENVIRONMENT === "production";
      // In production, run IDs are only accepted by the explicitly allow-listed
      // isolated QA deployment. Elsewhere they may be used for local test traces.
      const acceptQaAttribution = !isProduction || isQaRunnerEnabled();
      const suppliedRunId = acceptQaAttribution && request && typeof request.headers?.get === "function"
        ? request.headers.get("x-post2drive-qa-run-id")?.trim()
        : undefined;
      const qaRunId = suppliedRunId && /^[A-Za-z0-9._:-]{1,80}$/.test(suppliedRunId)
        ? suppliedRunId
        : null;
      try {
        await prisma.apiRequestMetric.create({
          data: {
            method: request && typeof request.method === "string" ? request.method.toUpperCase() : "UNKNOWN",
            route: routeTemplate,
            statusCode,
            durationMs: Math.max(0, Date.now() - startedAt),
            qaRunId,
          },
        });

        // Keep telemetry bounded without a cron dependency. Cleanup is rare
        // and only touches this metrics table, never business records.
        if (Math.random() < 0.002) {
          await prisma.apiRequestMetric.deleteMany({
            where: { createdAt: { lt: new Date(Date.now() - 30 * 24 * 60 * 60 * 1000) } },
          });
        }
      } catch (error) {
        // ORM errors can contain query and database metadata; log only a safe class name.
        console.error("Unable to persist API performance metric.", {
          errorName: error instanceof Error ? error.name : "UnknownError",
        });
      }
    }
  };
  return wrapped as T;
}
