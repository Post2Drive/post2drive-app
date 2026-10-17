import { readFileSync } from "node:fs";
import { strict as assert } from "node:assert";

const server = readFileSync(new URL("../../ops-dashboard/server.mjs", import.meta.url), "utf8");
const bridge = readFileSync(new URL("../../app/api/internal/admin-bridge/route.ts", import.meta.url), "utf8");
const migration = readFileSync(new URL("../../prisma/migrations/20261017183000_admin_audit_events/migration.sql", import.meta.url), "utf8");
const pkg = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8"));

for (const [name, pattern] of [
  ["separate operations service", /post2drive-ops-dashboard/],
  ["separate admin username", /OPS_DASHBOARD_USERNAME/],
  ["separate operator credential", /OPS_DASHBOARD_PASSWORD/],
  ["admin-only login form", /name="username"/],
  ["dashboard-only admin portal", /ADMIN DASHBOARD/],
  ["signed session secret", /OPS_DASHBOARD_SESSION_SECRET/],
  ["timing-safe password check", /timingSafeEqual/],
  ["read-only database guidance", /dedicated read-only database role/],
  ["country selector", /id="country"/],
  ["global market option", /Global · all markets/],
  ["country comparison selector", /id="compare"/],
  ["reporting period selector", /id="days"/],
  ["command centre navigation", /Command Centre/],
  ["needs-attention queue", /id="attentionQueue"/],
  ["audit CSV export", /id="exportAudit"/],
  ["formula-safe audit export", /if\(\/\^\[=\+@-\]\/\.test\(text\)\)/],
  ["country readiness evidence model", /COUNTRY_READINESS_JSON/],
  ["seven launch readiness gates", /operationalRecovery/],
  ["notification health view", /notificationSummary/],
  ["incident audit feed", /auditEvents/],
  ["short-lived metrics cache", /METRICS_CACHE_TTL_MS = 30_000/],
  ["duplicate metrics requests coalesced", /metricsInflight/],
  ["login brute-force rate limit", /LOGIN_MAX_ATTEMPTS = 10/],
  ["forwarded IP opt-in only", /TRUST_PROXY_HEADERS === "true"/],
  ["signed admin-action proxy", /api\/admin-action/],
  ["application-side signed bridge", /x-p2d-admin-signature/],
  ["tester approve and reject actions", /tester-approve/],

  ["no readiness without evidence", /g.evidenceRef && g.reviewedAt/],
  ["categorized admin navigation", /class="section-nav"/],
  ["tester review queue", /Pending tester applications/],
  ["access-code history", /TesterAccessCode/],
  ["incident review queue", /INCIDENT_REPORTED/],
  ["incident decisions fail closed without bridge configuration", /Secure application action bridge is not configured/],
  ["aggregated market research", /Aggregated market research/],
  ["small research groups suppressed", /HAVING count\(\*\) >= 3/],
  ["accounts and users metrics", /"totalAccounts"/],
  ["jobs and bids metrics", /"jobsWithBids"/],
  ["API performance metrics", /ApiRequestMetric/],
  ["QA run history", /qa_test_runs/],
  ["retained QA failure history", /qa_test_events/],
  ["vehicle compliance metrics", /"motExpired"/],
  ["source provenance and limitations", /External logistics industry trends/],
  ["no destructive QA cleanup", !/DELETE FROM|TRUNCATE TABLE|prisma\.[a-zA-Z]+\.deleteMany/.test(server) && /dedicated read-only database role/.test(server)),
  ["health endpoint", /url\.pathname === "\/health"/],
  ["metrics endpoint", /url\.pathname === "\/api\/metrics"/],
]) {
  if (typeof pattern === "boolean") assert.equal(pattern, true, name);
  else assert.match(server, pattern, name);
}
assert.equal(pkg.scripts["qa:ops-dashboard"], "node scripts/qa/ops-dashboard-contract.mjs");
assert.match(bridge, /authenticateBridge/);
assert.match(bridge, /timingSafeEqual/);
assert.match(bridge, /rateLimitBucket\.create/);
assert.match(bridge, /adminAuditEvent\.create/);
assert.match(bridge, /A review reason is required/);
assert.match(bridge, /120_000/);
assert.match(bridge, /Only an accepted or in-transit job can be terminated/);
assert.match(bridge, /codeHash/);
assert.match(migration, /CREATE TABLE "AdminAuditEvent"/);
assert.match(migration, /AdminAuditEvent_createdAt_idx/);
console.log("Ops dashboard contract checks passed.");
