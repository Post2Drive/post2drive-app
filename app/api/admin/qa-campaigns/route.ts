import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { randomUUID } from "node:crypto";
import { authOptions } from "@/lib/auth";
import { isTesterAdmin } from "@/lib/testerAdmin";
import { prisma } from "@/lib/prisma";
import { isQaRunnerEnabled } from "@/lib/qaRunnerGuard";
import { readBoundedJson } from "@/lib/requestBody";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_COUNTRIES = new Set(["GB","IN","AT","BE","BG","HR","CY","EE","FI","FR","DE","GR","IE","IT","LV","LT","LU","MT","NL","PT","SK","SI","ES","AD","MC","SM","VA","XK","ME","CZ","DK","HU","IS","NO","PL","RO","SE","CH","TR","US","CA","AU","NZ"]);
const ALLOWED_SUITES = new Set(["provisioning","api","workflow"]);
const MAX_VARIATIONS = 20;

function int(value: unknown, min: number, max: number) {
  const n = Number(value);
  return Number.isInteger(n) && n >= min && n <= max ? n : null;
}
function safeString(value: unknown, max = 120) {
  return typeof value === "string" ? value.trim().slice(0, max) : "";
}
function validate(body: any) {
  const name = safeString(body?.name);
  const countryCode = safeString(body?.countryCode, 2).toUpperCase();
  const scenario = safeString(body?.scenario);
  const totalCampaignTests = int(body?.totalCampaignTests, 1, 25000);
  const testsPerVariation = int(body?.testsPerVariation, 1, 25000);
  const accountCount = int(body?.accountCount, 500, 10000);
  const concurrency = int(body?.concurrency, 1, 100);
  const suites = Array.isArray(body?.suites) ? [...new Set(body.suites.filter((x: unknown): x is string => typeof x === "string" && ALLOWED_SUITES.has(x)))] : [];
  const variations = Array.isArray(body?.variations) ? body.variations.slice(0, MAX_VARIATIONS).map((v: any, i: number) => ({
    id: safeString(v?.id, 40) || "variation-" + (i + 1),
    name: safeString(v?.name, 80) || "Variation " + (i + 1),
    description: safeString(v?.description, 240),
    overrides: v?.overrides && typeof v.overrides === "object" && !Array.isArray(v.overrides) ? v.overrides : {},
  })) : [];
  const errors: string[] = [];
  if (!name) errors.push("Campaign name is required.");
  if (!ALLOWED_COUNTRIES.has(countryCode)) errors.push("Choose a supported country.");
  if (!scenario) errors.push("Scenario is required.");
  if (totalCampaignTests === null) errors.push("Total campaign tests must be from 1 to 25,000.");
  if (testsPerVariation === null) errors.push("Tests per variation must be from 1 to 25,000.");
  if (accountCount === null) errors.push("Account count must be from 500 to 10,000 for execution.");
  if (concurrency === null) errors.push("Concurrency must be from 1 to 100.");
  if (!suites.length) errors.push("Choose at least one test suite.");
  if (!Array.isArray(body?.variations) || body.variations.length < 1 || body.variations.length > MAX_VARIATIONS) errors.push("Add between 1 and 20 variations.");
  const allocatedIterations = variations.reduce((sum: number, variation: any) => {
    const raw = variation?.overrides?.testIterations;
    const count = raw === undefined || raw === null || raw === "" ? (testsPerVariation ?? 25001) : Number(raw);
    return sum + (Number.isInteger(count) && count >= 1 && count <= 25000 ? count : 25001);
  }, 0);
  if (totalCampaignTests !== null && allocatedIterations > totalCampaignTests) errors.push("Effective variation iterations cannot exceed the total campaign test count.");
  return { errors, value: { name, countryCode, scenario, totalCampaignTests, testsPerVariation, accountCount, concurrency, suites, variations } };
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Not logged in." }, { status: 401 });
  if (!(await isTesterAdmin())) return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  try {
    const [campaigns, rawRuns, rawSteps] = await Promise.all([
      prisma.$queryRawUnsafe<any[]>(`
        SELECT id, name, target_environment AS "targetEnvironment", country_code AS "countryCode",
          scenario, total_campaign_tests AS "totalCampaignTests", tests_per_variation AS "testsPerVariation",
          account_count AS "accountCount", concurrency, suites, variations, execution_mode AS "executionMode",
          status, created_at AS "createdAt", updated_at AS "updatedAt"
        FROM qa_test_campaigns ORDER BY created_at DESC LIMIT 100
      `),
      prisma.$queryRawUnsafe<any[]>(`
        SELECT id, status, target_accounts AS "targetAccounts", created_accounts AS "createdAccounts",
          successful_checks AS "successfulChecks", failed_checks AS "failedChecks", duration_ms AS "durationMs",
          started_at AS "startedAt", finished_at AS "finishedAt", summary->>'country' AS "countryCode",
          summary->>'testType' AS "testType", summary->>'loadRequestCount' AS "loadRequestCount",
          summary->>'campaignId' AS "campaignId", summary->>'variationId' AS "variationId",
          summary->>'variationName' AS "variationName", summary->>'suite' AS "suite",
          summary->>'testIterations' AS "testIterations", summary->>'concurrencyTarget' AS "concurrencyTarget",
          summary->>'p50Ms' AS "p50Ms", summary->>'p95Ms' AS "p95Ms"
        FROM qa_test_runs ORDER BY started_at DESC LIMIT 50
      `),
      prisma.$queryRawUnsafe<any[]>(`
        SELECT s.id, s.campaign_id AS "campaignId", s.ordinal, s.variation_id AS "variationId",
          s.variation_name AS "variationName", s.suite, s.test_type AS "testType",
          s.test_iterations AS "testIterations", s.account_count AS "accountCount", s.concurrency,
          s.status, s.run_id AS "runId", s.started_at AS "startedAt", s.finished_at AS "finishedAt",
          r.successful_checks AS "successfulChecks", r.failed_checks AS "failedChecks",
          r.duration_ms AS "durationMs", r.summary->>'loadRequestCount' AS "loadRequestCount",
          r.summary->>'routeMatrixExecuted' AS "routeMatrixExecuted", r.summary->>'p50Ms' AS "p50Ms",
          r.summary->>'p95Ms' AS "p95Ms", r.summary->>'eventCount' AS "eventCount"
        FROM qa_test_campaign_steps s LEFT JOIN qa_test_runs r ON r.id=s.run_id
        ORDER BY s.campaign_id,s.ordinal LIMIT 1000
      `)
    ]);
    const normalise = (row: any) => ({ ...row, durationMs: row.durationMs === null ? null : row.durationMs === undefined ? null : Number(row.durationMs) });
    const runs = rawRuns.map(normalise);
    const steps = rawSteps.map(normalise);
    return NextResponse.json({ campaigns, runs, steps, executionEnabled: isQaRunnerEnabled() }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    console.error("QA campaign history unavailable", error);
    return NextResponse.json({ error: "Campaign storage is not available yet. Apply the reviewed QA campaign metadata migration to staging before using this page." }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Not logged in." }, { status: 401 });
  if (!(await isTesterAdmin())) return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  const parsedBody = await readBoundedJson(request, 32 * 1024);
  if (!parsedBody.ok) {
    return NextResponse.json(
      { error: parsedBody.status === 413 ? "Request body is too large." : "Request body must be JSON." },
      { status: parsedBody.status },
    );
  }
  if (!parsedBody.value || typeof parsedBody.value !== "object" || Array.isArray(parsedBody.value)) {
    return NextResponse.json({ error: "Request body must be a JSON object." }, { status: 400 });
  }
  const { errors, value } = validate(parsedBody.value);
  if (errors.length) return NextResponse.json({ error: errors.join(" "), validationErrors: errors }, { status: 400 });
  const id = "campaign-" + randomUUID();
  const createdBy = session.user?.email ? String(session.user.email).slice(0, 254) : null;
  try {
    await prisma.$executeRawUnsafe(
      `INSERT INTO qa_test_campaigns
       (id,name,target_environment,country_code,scenario,total_campaign_tests,tests_per_variation,account_count,concurrency,suites,variations,execution_mode,status,created_by)
       VALUES ($1,$2,'staging',$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,'preview_only','draft',$11)`,
      id, value.name, value.countryCode, value.scenario, value.totalCampaignTests, value.testsPerVariation,
      value.accountCount, value.concurrency, JSON.stringify(value.suites), JSON.stringify(value.variations), createdBy
    );
    return NextResponse.json({ id, status: "draft", executionMode: "preview_only" }, { status: 201, headers: { "cache-control": "no-store" } });
  } catch (error) {
    console.error("Could not save QA campaign draft", error);
    return NextResponse.json({ error: "Could not save the campaign draft. Confirm the campaign metadata migration is applied and the app database role has the required table permissions." }, { status: 503 });
  }
}
