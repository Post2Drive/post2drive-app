import { createHash } from "crypto";
import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";
import { isAuthorizedQaRunId } from "@/lib/qaRunAuthorization";

type RateLimitOptions = {
  scope: string;
  identity: string;
  limit: number;
  windowMs: number;
};

function bucketKey(scope: string, identity: string, windowStart: number) {
  // Only a one-way digest is persisted; never write raw emails, IPs or account IDs.
  return createHash("sha256")
    .update(`${scope}\u0000${identity}\u0000${windowStart}`)
    .digest("hex");
}

/**
 * Atomic PostgreSQL fixed-window rate limit shared across app instances.
 * Fail closed if the limiter table is missing or unreachable: public write
 * endpoints should not quietly become unbounded when their safety control fails.
 */
export async function checkRateLimit({ scope, identity, limit, windowMs }: RateLimitOptions) {
  const now = Date.now();
  const windowStart = Math.floor(now / windowMs);
  const key = bucketKey(scope, identity, windowStart);
  const expiresAt = new Date((windowStart + 2) * windowMs);
  const rows = await prisma.$queryRaw<Array<{ count: number }>>`
    INSERT INTO "RateLimitBucket" ("key", "count", "expiresAt")
    VALUES (${key}, 1, ${expiresAt})
    ON CONFLICT ("key") DO UPDATE
      SET "count" = "RateLimitBucket"."count" + 1
    RETURNING "count"
  `;
  const count = Number(rows[0]?.count ?? limit + 1);

  // Opportunistic expiry cleanup; this table never stores raw identifiers.
  if (Math.random() < 0.01) {
    void prisma.rateLimitBucket.deleteMany({ where: { expiresAt: { lt: new Date(now) } } })
      .catch((error) => console.error("Rate-limit expiry cleanup failed.", {
        errorName: error instanceof Error ? error.name : "UnknownError",
      }));
  }

  return {
    allowed: count <= limit,
    count,
    limit,
    retryAfterSeconds: Math.max(1, Math.ceil(((windowStart + 1) * windowMs - now) / 1000)),
  };
}

export function rateLimitResponse(retryAfterSeconds: number, message = "Too many attempts. Please wait and try again.") {
  return NextResponse.json(
    { error: message, code: "RATE_LIMITED", retryAfterSeconds },
    { status: 429, headers: { "Retry-After": String(retryAfterSeconds), "Cache-Control": "no-store" } },
  );
}

export function clientNetworkIdentity(request: Request): string {
  // Prefer headers commonly overwritten by a trusted edge proxy. x-forwarded-for
  // is only a fallback and should be set/normalised by the chosen host.
  const identity = request.headers.get("cf-connecting-ip")?.trim()
    || request.headers.get("x-real-ip")?.trim()
    || request.headers.get("x-forwarded-for")?.split(",")[0]?.trim()
    || "unavailable";
  return identity.slice(0, 200);
}

/** Apply a shared durable limit and convert DB failures to a safe 503 response. */
export async function enforceRateLimit(request: Request, options: Omit<RateLimitOptions, "identity"> & { identity?: string }) {
  try {
    const qaRunId = request.headers.get("x-post2drive-qa-run-id");
    // Railway may expose an internal HTTP URL behind the HTTPS edge proxy.
    // Authorization independently verifies the allow-listed staging target and active persisted run.
    if (qaRunId && await isAuthorizedQaRunId(qaRunId)) {
      return null;
    }
    const result = await checkRateLimit({ ...options, identity: options.identity ?? clientNetworkIdentity(request) });
    if (!result.allowed) return rateLimitResponse(result.retryAfterSeconds);
    return null;
  } catch (error) {
    console.error(`Rate-limit control unavailable for ${options.scope}.`, {
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
    return NextResponse.json(
      { error: "This action is temporarily unavailable. Please try again shortly.", code: "RATE_LIMIT_UNAVAILABLE" },
      { status: 503, headers: { "Retry-After": "30", "Cache-Control": "no-store" } },
    );
  }
}
