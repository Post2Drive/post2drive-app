import { readFileSync } from "node:fs";
import { strict as assert } from "node:assert";

const server = readFileSync(new URL("../../ops-dashboard/server.mjs", import.meta.url), "utf8");
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
  ["categorized admin navigation", /class="section-nav"/],
  ["tester review queue", /Pending tester applications/],
  ["access-code history", /TesterAccessCode/],
  ["incident review queue", /INCIDENT_REPORTED/],
  ["incident decisions remain behind secure bridge", /secured application-side action bridge/],
  ["aggregated market research", /Aggregated market research/],
  ["small research groups suppressed", /HAVING count\(\) >= 3/],
  ["accounts and users metrics", /"totalAccounts"/],
  ["jobs and bids metrics", /"jobsWithBids"/],
  ["API performance metrics", /ApiRequestMetric/],
  ["QA run history", /qa_test_runs/],
  ["retained QA failure history", /qa_test_events/],
  ["vehicle compliance metrics", /"motExpired"/],
  ["source provenance and limitations", /External logistics industry trends/],
  ["no destructive QA cleanup", !/DELETE FROM|TRUNCATE TABLE|prisma\.[a-zA-Z]+\.deleteMany/.test(server) && /read-only reporting/.test(server)),
  ["health endpoint", /url\.pathname === "\/health"/],
  ["metrics endpoint", /url\.pathname === "\/api\/metrics"/],
]) {
  if (typeof pattern === "boolean") assert.equal(pattern, true, name);
  else assert.match(server, pattern, name);
}
assert.equal(pkg.scripts["qa:ops-dashboard"], "node scripts/qa/ops-dashboard-contract.mjs");
console.log("Ops dashboard contract checks passed.");
