import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { isCrossSiteWrite } from "./lib/originGuard.ts";

/**
 * Refuses cross-site state-changing API requests before they reach a route.
 * See lib/originGuard.ts for the rule and the exempt machine endpoints.
 */
export function proxy(request: NextRequest) {
  const crossSite = isCrossSiteWrite({
    method: request.method,
    pathname: request.nextUrl.pathname,
    origin: request.headers.get("origin"),
    secFetchSite: request.headers.get("sec-fetch-site"),
    allowedHosts: [
      request.headers.get("x-forwarded-host"),
      request.headers.get("host"),
      process.env.NEXTAUTH_URL,
      process.env.POST2DRIVE_APP_URL,
    ],
  });
  if (crossSite) {
    return NextResponse.json(
      { error: "Cross-site request refused." },
      { status: 403, headers: { "Cache-Control": "no-store" } },
    );
  }
  return NextResponse.next();
}

export const config = { matcher: "/api/:path*" };
