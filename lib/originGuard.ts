/**
 * Cross-site request guard for state-changing API calls (CSRF defence in depth,
 * on top of SameSite session cookies).
 *
 * Browsers always attach `Origin` to cross-site POST/PUT/PATCH/DELETE, so a
 * request whose Origin is another site is refused before it reaches a route.
 * Requests with no Origin (server-to-server, CLI, the QA worker) pass through
 * and are authenticated by the route itself. Machine endpoints that carry
 * their own signature or secret are exempt.
 */
export const UNSAFE_METHODS = new Set(["POST", "PUT", "PATCH", "DELETE"]);

// Authenticated by provider signature or a shared secret, never by a browser session.
export const ORIGIN_EXEMPT_PREFIXES = [
  "/api/subscription/webhook",
  "/api/verification/start/webhook",
  "/api/internal/",
  "/api/security/csp-report",
] as const;

function hostOf(value: string | null | undefined): string | null {
  if (!value) return null;
  try { return new URL(value).host.toLowerCase(); } catch { return null; }
}

export interface OriginCheckInput {
  method: string;
  pathname: string;
  origin: string | null;
  secFetchSite: string | null;
  /** Hosts this deployment answers on: forwarded host, Host header, configured app URLs. */
  allowedHosts: Array<string | null | undefined>;
}

export function isCrossSiteWrite(input: OriginCheckInput): boolean {
  if (!input.pathname.startsWith("/api/")) return false;
  if (!UNSAFE_METHODS.has(input.method.toUpperCase())) return false;
  const exempt = ORIGIN_EXEMPT_PREFIXES.some((prefix) =>
    input.pathname === prefix || input.pathname.startsWith(prefix.endsWith("/") ? prefix : `${prefix}/`));
  if (exempt) return false;

  const allowed = new Set(
    input.allowedHosts
      .map((host) => (host && host.includes("://") ? hostOf(host) : host?.toLowerCase().trim() || null))
      .filter((host): host is string => Boolean(host)),
  );
  if (input.origin !== null) {
    // "null" (sandboxed frame, some redirects) and unparsable origins are never ours.
    const originHost = hostOf(input.origin);
    return !originHost || !allowed.has(originHost);
  }
  // No Origin: trust the browser's own verdict when it gives one.
  return input.secFetchSite === "cross-site";
}
