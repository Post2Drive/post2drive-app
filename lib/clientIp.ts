/**
 * Which request header carries the real client IP depends on the edge in
 * front of the app. Only a header the edge OVERWRITES can be trusted; any
 * other header is attacker-controlled and would let a client pick a fresh
 * rate-limit bucket on every request.
 *
 * Railway's edge sets X-Real-IP to the client's remote address, so that is
 * the default. If Cloudflare (or another proxy) is placed in front later,
 * set TRUSTED_CLIENT_IP_HEADER to its header (e.g. "cf-connecting-ip").
 */
const ALLOWED_HEADERS = new Set(["x-real-ip", "cf-connecting-ip", "fly-client-ip", "true-client-ip", "x-forwarded-for"]);

export function trustedClientIpHeader(env: Record<string, string | undefined> = process.env): string {
  const configured = env.TRUSTED_CLIENT_IP_HEADER?.trim().toLowerCase();
  return configured && ALLOWED_HEADERS.has(configured) ? configured : "x-real-ip";
}

export function clientNetworkIdentity(request: Request, env: Record<string, string | undefined> = process.env): string {
  const header = trustedClientIpHeader(env);
  const raw = request.headers.get(header) || "";
  // For X-Forwarded-For the trusted proxy appends the client last; earlier
  // entries can be forged by the client, so take the right-most value.
  const value = header === "x-forwarded-for" ? raw.split(",").map((part) => part.trim()).filter(Boolean).pop() || "" : raw.trim();
  return (value || "unavailable").slice(0, 200);
}
