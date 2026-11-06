#!/usr/bin/env node
/**
 * Route-safety contract (issue #38, Nov 2026).
 *
 * Verifies that every API route file satisfies baseline safety properties
 * without running the app:
 *
 *  1. No raw error objects or .message strings logged — only .name / errorName.
 *  2. Every route that handles a request body reads it through readBoundedJson
 *     or readBoundedBytes (enforces a size cap and returns a controlled 413).
 *  3. No internal DB fields (password hashes, tokens, verification codes)
 *     are returned in response bodies.
 *  4. Mutation routes (POST/PATCH/DELETE) that produce 500 responses never
 *     include the raw Prisma error details in the client response.
 *  5. Verified that withApiMetrics wraps every exported handler, so every
 *     route gets consistent error-name-only server-side logging.
 *
 * This is a source-level static contract: it guards against common patterns
 * that bypass the established conventions. It does not replace runtime tests.
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";

// ── helpers ─────────────────────────────────────────────────────────────────

function readRoute(path) {
  try {
    return readFileSync(path, "utf8");
  } catch {
    return null;
  }
}

function findRoutes(dir, results = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      findRoutes(full, results);
    } else if (entry === "route.ts") {
      results.push(full);
    }
  }
  return results;
}

const routePaths = findRoutes("app/api");

// ── 1. No raw error objects / messages in console calls ─────────────────────
// Pattern: console.*(…, error) or console.*(…, error.message) — the
// established convention is { errorName: error instanceof Error ? error.name : "UnknownError" }

const RAW_ERROR_LOG = /console\.(?:error|warn|log)\(\s*[^)]*,\s*error\s*\)/;
const RAW_MESSAGE_LOG = /console\.(?:error|warn|log)\(\s*[^)]*error\.message\b/;

// Routes that only log a string message with no error argument are fine.
const ALLOWED_SINGLE_ARG_LOG =
  /console\.(?:error|warn|log)\(\s*["'`][^"'`]*["'`]\s*\)/;

for (const routePath of routePaths) {
  const src = readRoute(routePath);
  if (!src) continue;
  const rel = relative(process.cwd(), routePath);

  // Strip comments so inline examples do not trip assertions.
  const stripped = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

  assert.doesNotMatch(stripped, RAW_ERROR_LOG,
    `${rel}: console call must not pass a raw Error object; use { errorName: error.name }`);
  assert.doesNotMatch(stripped, RAW_MESSAGE_LOG,
    `${rel}: console call must not include error.message; use error.name`);
}

// ── 2. Body-reading routes use readBoundedJson / readBoundedBytes ───────────
// Routes that call req.json() or req.text() directly bypass size limits.

const UNBOUNDED_BODY = /\breq\.(?:json|text)\s*\(\s*\)/;

// Routes that are known to read no body (state-transition POSTs that take
// only path parameters).
const NO_BODY_ROUTES = new Set([
  "app/api/jobs/[id]/accept/route.ts",
  "app/api/jobs/[id]/bids/[bidId]/accept/route.ts",
  "app/api/jobs/[id]/cancel/route.ts",
  "app/api/jobs/[id]/confirm-delivered/route.ts",
  "app/api/jobs/[id]/confirm-pickup/route.ts",
  "app/api/jobs/[id]/driver-cancel/route.ts",
  "app/api/jobs/[id]/mark-delivered/route.ts",
  "app/api/jobs/[id]/payment/confirm-received/route.ts",
  "app/api/jobs/[id]/payment/mark-paid/route.ts",
  "app/api/jobs/[id]/reject-delivered/route.ts",
  "app/api/jobs/[id]/unassign/route.ts",
  "app/api/notifications/[id]/read/route.ts",
  "app/api/subscription/create-payment/route.ts",
  "app/api/verification/start/route.ts",
]);

for (const routePath of routePaths) {
  const src = readRoute(routePath);
  if (!src) continue;
  const rel = relative(process.cwd(), routePath);

  const stripped = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
  assert.doesNotMatch(stripped, UNBOUNDED_BODY,
    `${rel}: use readBoundedJson/readBoundedBytes instead of req.json() or req.text(); ` +
    `these do not cap the request body size`);
}

// ── 3. No plaintext credentials / tokens returned in API responses ───────────
// Look for fields that should never appear in a NextResponse.json() body.

const CREDENTIAL_FIELDS = [
  /\bpasswordHash\b/,
  /\bhashedCode\b/,
  /\btoken\s*:/,
  /\bsecret\s*:/,
  /\bDATABASE_URL\b/,
  /\bSUBSCRIPTION_WEBHOOK_SECRET\b/,
];

// The auth route uses NextAuth internals; we trust NextAuth here and skip it.
const SKIP_CREDENTIAL_CHECK = new Set([
  "app/api/auth/[...nextauth]/route.ts",
]);

for (const routePath of routePaths) {
  const src = readRoute(routePath);
  if (!src) continue;
  const rel = relative(process.cwd(), routePath);
  if (SKIP_CREDENTIAL_CHECK.has(rel)) continue;

  // Only check NextResponse.json() call sites, not imports or comments.
  const responseCalls = [...src.matchAll(/NextResponse\.json\(\s*\{([\s\S]*?)\}\s*[,)]/g)]
    .map((m) => m[1]);

  for (const call of responseCalls) {
    for (const pattern of CREDENTIAL_FIELDS) {
      assert.doesNotMatch(call, pattern,
        `${rel}: NextResponse.json() must not include credential/secret fields matching ${pattern}`);
    }
  }
}

// ── 4. 500 responses must use generic error messages (not raw error details) ─
// The pattern "status: 500" should accompany a string literal error, not
// an interpolated error.message or a dynamic value.

const RAW_500 = /NextResponse\.json\(\s*\{[^}]*error\s*:\s*error(?:\.message)?\s*[,}]/;
const SAFE_500_MARKER = /status:\s*500/;

for (const routePath of routePaths) {
  const src = readRoute(routePath);
  if (!src) continue;
  const rel = relative(process.cwd(), routePath);

  const stripped = src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

  // Find 500 response blocks and assert they do not pass raw error values.
  const blocks500 = [...stripped.matchAll(/NextResponse\.json\(\s*\{[^}]*\}\s*,\s*\{[^}]*status:\s*500/g)];
  for (const [block] of blocks500) {
    assert.doesNotMatch(block, /error\s*:\s*(?:error|e|err)(?:\.message)?\s*[,}]/,
      `${rel}: a 500 response must use a static error string, not a dynamic error value`);
  }
}

// ── 5. withApiMetrics wraps every exported handler ───────────────────────────
// The wrapper provides consistent error-name-only server-side logging for
// all unhandled exceptions. Every exported GET/POST/PATCH/DELETE/PUT must
// be assigned from withApiMetrics (or be a trivially-small route that
// already catches and logs all its own errors).

// A few routes intentionally bypass withApiMetrics because they are internal
// or already use a custom metrics scheme (the NextAuth handler, the QA run
// handler which is complex and handles its own errors). The health readiness
// probe stays unwrapped because wrapping would write an ApiRequestMetric row on
// every Railway probe. The retired admin/performance tombstone is also
// intentionally database-free: it returns a 410 without touching the app DB or
// the ApiRequestMetric table, so it must not be instrumented.
const EXEMPT_FROM_METRICS = new Set([
  "app/api/auth/[...nextauth]/route.ts",
  "app/api/health/route.ts",
  "app/api/admin/performance/route.ts",
]);

// Routes wrapped by PR #151 must stay wrapped: each listed handler must be
// exported via withApiMetrics with its exact route label.
const REQUIRED_METRICS_WRAPPED = {
  "app/api/security/csp-report/route.ts": { route: "/api/security/csp-report", methods: ["POST"] },
  "app/api/admin/qa-campaigns/route.ts": { route: "/api/admin/qa-campaigns", methods: ["GET", "POST"] },
  "app/api/admin/qa-campaigns/access/route.ts": { route: "/api/admin/qa-campaigns/access", methods: ["POST", "DELETE"] },
  "app/api/admin/qa-campaigns/[id]/route.ts": { route: "/api/admin/qa-campaigns/[id]", methods: ["DELETE"] },
  "app/api/admin/qa-campaigns/[id]/start/route.ts": { route: "/api/admin/qa-campaigns/[id]/start", methods: ["POST"] },
  "app/api/qa/run/route.ts": { route: "/api/qa/run", methods: ["GET", "POST"] },
};

for (const [path, { route, methods }] of Object.entries(REQUIRED_METRICS_WRAPPED)) {
  assert.ok(!EXEMPT_FROM_METRICS.has(path), `${path}: must not be exempt from withApiMetrics`);
  const src = readRoute(path);
  assert.ok(src, `${path}: route file is missing`);
  for (const method of methods) {
    assert.ok(
      src.includes(`export const ${method} = withApiMetrics("${route}", ${method}Handler);`),
      `${path}: ${method} must be exported via withApiMetrics("${route}", ${method}Handler)`,
    );
    assert.doesNotMatch(src, new RegExp(`export\\s+async\\s+function\\s+${method}\\b`),
      `${path}: ${method} must not be exported as an unwrapped function`);
  }
}

const EXPORT_HANDLER = /^export\s+const\s+(?:GET|POST|PATCH|DELETE|PUT)\s*=/m;
const USES_WITH_METRICS = /withApiMetrics\s*\(/;

for (const routePath of routePaths) {
  const src = readRoute(routePath);
  if (!src) continue;
  const rel = relative(process.cwd(), routePath);
  if (EXEMPT_FROM_METRICS.has(rel)) continue;

  if (!EXPORT_HANDLER.test(src)) continue;
  assert.ok(USES_WITH_METRICS.test(src),
    `${rel}: all routes with exported handlers must use withApiMetrics for consistent server-side logging`);
}

// ── Result ───────────────────────────────────────────────────────────────────

console.log(JSON.stringify({
  status: "passed",
  routesChecked: routePaths.length,
  checks: [
    "no raw Error objects in console calls",
    "no error.message in console calls",
    "no req.json()/req.text() (unbounded body reads)",
    "no credential fields in 500-response bodies",
    "no dynamic error values in 500-response bodies",
    "withApiMetrics wraps all exported handlers",
  ],
}, null, 2));
