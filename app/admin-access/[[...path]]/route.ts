import type { NextRequest } from "next/server";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type RouteContext = { params: Promise<{ path?: string[] }> };
const EMBEDDED_DASHBOARD_ORIGIN = "http://127.0.0.1:3101";
const RESPONSE_HEADERS = [
  "content-type",
  "cache-control",
  "set-cookie",
  "location",
  "retry-after",
  "content-security-policy",
  "x-content-type-options",
  "x-frame-options",
  "referrer-policy",
];

function unavailable(request: NextRequest, path: string[]) {
  if (request.method === "GET" && path.length === 0) {
    const configured = process.env.OPS_DASHBOARD_URL;
    if (configured) {
      try {
        const destination = new URL(configured);
        const sameEmbeddedPath = destination.origin === request.nextUrl.origin &&
          (destination.pathname === "/admin-access" || destination.pathname === "/admin-access/");
        if (destination.protocol === "https:" && !sameEmbeddedPath) {
          return Response.redirect(destination, 307);
        }
      } catch {
        // Never redirect to malformed configuration.
      }
    }
    return new Response(
      "<!doctype html><html lang=\"en\"><meta charset=\"utf-8\"><meta name=\"viewport\" content=\"width=device-width,initial-scale=1\"><title>Admin dashboard unavailable</title><body style=\"font:16px system-ui;background:#0b1220;color:#eaf1fa;padding:32px\"><main style=\"max-width:760px;margin:0 auto\"><h1>Admin dashboard unavailable</h1><p>The embedded operations dashboard is disabled or not configured for this deployment. No redirect loop was started.</p></main></body></html>",
      { status: 503, headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" } },
    );
  }
  return Response.json({ error: "Embedded operations dashboard is disabled in this environment." }, {
    status: 503,
    headers: { "cache-control": "no-store" },
  });
}

async function proxy(request: NextRequest, context: RouteContext): Promise<Response> {
  const { path = [] } = await context.params;
  if (process.env.ENABLE_EMBEDDED_OPS_DASHBOARD !== "true") {
    return unavailable(request, path);
  }

  const requestPath = path.length
    ? "/admin-access/" + path.map((part) => encodeURIComponent(part)).join("/")
    : "/admin-access";
  const target = new URL(requestPath, EMBEDDED_DASHBOARD_ORIGIN);
  target.search = request.nextUrl.search;

  const isAdminAction = request.method === "POST" && path.join("/") === "api/admin-action";
  if (isAdminAction) {
    const originHeader = request.headers.get("origin");
    const requestOrigin = request.nextUrl.origin;
    if (!originHeader || originHeader !== requestOrigin) {
      return Response.json({ error: "Same-origin admin request required" }, {
        status: 403,
        headers: { "cache-control": "no-store" },
      });
    }
  }

  const headers = new Headers();
  for (const name of ["accept", "content-type", "cookie", "user-agent"]) {
    const value = request.headers.get(name);
    if (value) headers.set(name, value);
  }
  // The public request's origin is checked above. The embedded service then
  // receives a trusted internal same-origin value for its own CSRF guard.
  if (isAdminAction) headers.set("origin", "https://127.0.0.1:3101");
  else {
    const origin = request.headers.get("origin");
    if (origin) headers.set("origin", origin);
  }

  try {
    const upstream = await fetch(target, {
      method: request.method,
      headers,
      body: request.method === "GET" || request.method === "HEAD" ? undefined : await request.arrayBuffer(),
      cache: "no-store",
      redirect: "manual",
      signal: AbortSignal.timeout(12_000),
    });
    const responseHeaders = new Headers();
    for (const name of RESPONSE_HEADERS) {
      const value = upstream.headers.get(name);
      if (value) responseHeaders.set(name, value);
    }
    responseHeaders.set("cache-control", "no-store");
    return new Response(upstream.body, {
      status: upstream.status,
      headers: responseHeaders,
    });
  } catch {
    return Response.json({ error: "Operations dashboard service is temporarily unavailable." }, {
      status: 502,
      headers: { "cache-control": "no-store" },
    });
  }
}

export const GET = proxy;
export const POST = proxy;
export const HEAD = proxy;
