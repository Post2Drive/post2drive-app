import { withApiMetrics } from "@/lib/apiMetrics";
import { enforceRateLimit } from "@/lib/rateLimit";
import NextAuth from "next-auth";
import { authOptions } from "@/lib/auth";

const handler = NextAuth(authOptions);

async function rateLimitedAuthPost(request: Request, context: unknown) {
  const pathname = new URL(request.url).pathname;

  // Limit credential callbacks across all app instances using the shared
  // PostgreSQL limiter. Other NextAuth POSTs (CSRF/signout) are unaffected.
  if (pathname.endsWith("/api/auth/callback/credentials") || pathname.endsWith("/auth/callback/credentials")) {
    const limited = await enforceRateLimit(request, {
      scope: "login-credentials-network",
      limit: 10,
      windowMs: 15 * 60 * 1000,
    });
    if (limited) return limited;
  }

  return handler(request, context);
}

export const GET = withApiMetrics("/api/auth/[...nextauth]", handler);
export const POST = withApiMetrics("/api/auth/[...nextauth]", rateLimitedAuthPost);
