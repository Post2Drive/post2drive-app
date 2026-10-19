import { readFileSync } from "node:fs";
import { strict as assert } from "node:assert";
import { Script } from "node:vm";

const server = readFileSync(new URL("../../ops-dashboard/server.mjs", import.meta.url), "utf8");
const proxyRoute = readFileSync(new URL("../../app/admin-access/[[...path]]/route.ts", import.meta.url), "utf8");
const retiredPerformanceApi = readFileSync(new URL("../../app/api/admin/performance/route.ts", import.meta.url), "utf8");
const bridge = readFileSync(new URL("../../app/api/internal/admin-bridge/route.ts", import.meta.url), "utf8");
const migration = readFileSync(new URL("../../prisma/migrations/20261017183000_admin_audit_events/migration.sql", import.meta.url), "utf8");
const pkg = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8"));

const inlineScript = server.match(/<script>\n([\s\S]*?)\n<\/script>/)?.[1];
assert.ok(inlineScript, "Operations dashboard inline browser script exists");
const browserScript = inlineScript.replace(/\\\$\{/g, "${");
assert.doesNotThrow(() => new Script(browserScript), "Operations dashboard browser script must parse before deployment");

for (const [name, pattern] of [
  ["separate operations service", /post2drive-ops-dashboard/],
  ["separate admin username", /OPS_DASHBOARD_USERNAME/],
  ["separate operator credential", /OPS_DASHBOARD_PASSWORD/],
  ["admin-only login form", /name="username"/],
  ["dashboard-only admin portal", /ADMIN DASHBOARD/],
  ["signed session secret", /OPS_DASHBOARD_SESSION_SECRET/],
  ["timing-safe password check", /timingSafeEqual/],
  ["read-only database guidance", /dedicated read-only database role/],
  ["country selector", /id=[\'"]country[\'"]/],
  ["global market option", /Global · all markets/],
  ["country comparison selector", /id=[\'"]compare[\'"]/],
  ["reporting period selector", /id=[\'"]days[\'"]/],
  ["compact filter popover", /id=\'filterDrawer\'/],
  ["source directory search", /id="sourceSearch"/],
  ["explicit filter apply action", /id=['"]applyFilters['"]/],
  ["reporting-only filter reset", /id=['"]resetFilters['"]/],
  ["filter changes applied in one batch", /applyFilters.*filterDrawer.*load\(false\)/],
  ["refresh cancels stale browser requests", /activeLoadController\.abort\(\)/],
  ["forced refresh includes a cache-busting timestamp", /params\._ts=String\(Date\.now\(\)\)/],
  ["latest metrics request owns cache publication", /metricsInflight\.get\(key\) === pending/],
  ["risk website search", /id="riskSearch"/],
  ["refresh explicitly bypasses cache", /url\.searchParams\.get\("refresh"\) === "1"/],
  ["refresh UI requests forced DB read", /params\.refresh="1"/],
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
  ["same-origin mutation protection", /Same-origin admin request required/],
  ["application-side signed bridge", /x-p2d-admin-signature/],
  ["HTTPS bridge configuration gate", /function bridgeReady\(\)/],
  ["tester approve and reject actions", /tester-approve/],

  ["no readiness without evidence", /g.evidenceRef && g.reviewedAt/],
  ["ISO readiness timestamps use numeric date fields", /\/\^\\d\{4\}-\\d\{2\}-\\d\{2\}T/],
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
  ["QA campaign builder is in the Ops Dashboard", /id="qaCampaignForm"/],
  ["QA campaign history loads from the dashboard service", /url\.pathname === "\/api\/qa-campaigns"/],
  ["QA campaign actions use the signed admin bridge", /qa-campaign-create.*qa-campaign-delete.*qa-campaign-start/],

  ["QA history is retained when a draft is deleted", /No QA runs, steps, accounts, events, or reports will be deleted/],
  ["retained QA failure history", /qa_test_events/],
  ["vehicle compliance metrics", /"motExpired"/],
  ["source provenance and limitations", /External logistics industry trends/],
  ["seasonality and risk intelligence section", /Seasonality & risk intelligence/],
  ["seasonal calendar market selection", /id="seasonalCalendar"/],
  ["disruption watchlist labels manual-only status", /Manual monitoring only · no live incident detection/],
  ["editable what-if scenario simulator", /function renderSeasonality\(market\)/],
  ["scenario simulator marks inputs as hypothetical", /not observed Post2Drive metrics/],
  ["scenario simulator bounds user inputs", /Math\.max\(-100,Math\.min\(500/],
  ["official road freight dataset", /databrowser\/product\/page\/TTR00005/],
  ["external risk data not misrepresented as ingested", /External series have not been ingested into Post2Drive/],
  ["no destructive QA cleanup", !/DELETE FROM|TRUNCATE TABLE|prisma\.[a-zA-Z]+\.deleteMany/.test(server) && /dedicated read-only database role/.test(server)],
  ["health endpoint", /url\.pathname === "\/health"/],
  ["metrics endpoint", /url\.pathname === "\/api\/metrics"/],
]) {
  if (typeof pattern === "boolean") assert.equal(pattern, true, name);
  else assert.match(server, pattern, name);
}
assert.equal(pkg.scripts["qa:ops-dashboard"], "node scripts/qa/ops-dashboard-contract.mjs");
assert.match(proxyRoute, /127\.0\.0\.1:3101/);
assert.match(proxyRoute, /ENABLE_EMBEDDED_OPS_DASHBOARD/);
assert.match(proxyRoute, /Same-origin admin request required/);
assert.match(proxyRoute, /OPS_DASHBOARD_URL/);
assert.match(server, /current_user AS username/);
assert.match(server, /unexpected database role/);
assert.match(server, /writable table privileges detected/);
assert.match(server, /sequence privileges detected/);
assert.match(server, /role membership detected/);
assert.match(server, /DEPLOYMENT_ENVIRONMENT === "staging" && identity.database !== "post2drive_qa"/);
assert.doesNotMatch(retiredPerformanceApi, /prisma|queryRaw|withApiMetrics/);
assert.match(retiredPerformanceApi, /status: 410/);
assert.match(retiredPerformanceApi, /replacement:/);
assert.match(bridge, /authenticateBridge/);
assert.match(bridge, /timingSafeEqual/);
assert.match(bridge, /rateLimitBucket\.create/);
assert.match(bridge, /adminAuditEvent\.create/);
assert.match(bridge, /A review reason is required/);
assert.match(bridge, /120_000/);
assert.match(bridge, /Only an accepted or in-transit job can be terminated/);
assert.match(bridge, /codeHash/);
assert.match(bridge, /action === "qa-campaign-create"/);
assert.match(bridge, /action === "qa-campaign-delete"/);
assert.match(bridge, /action === "qa-campaign-start"/);
assert.match(bridge, /isQaRunnerEnabled\(\)/);
assert.match(bridge, /campaign\.status !== "draft"/);
assert.match(bridge, /WITH queue_lock AS MATERIALIZED/);
assert.match(migration, /CREATE TABLE "AdminAuditEvent"/);
assert.match(migration, /AdminAuditEvent_createdAt_idx/);
console.log("Ops dashboard contract checks passed.");
