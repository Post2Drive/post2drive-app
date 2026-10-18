import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { randomUUID } from "node:crypto";
import { authOptions } from "@/lib/auth";
import { isTesterAdmin } from "@/lib/testerAdmin";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const ALLOWED_COUNTRIES = new Set(["GB","IN","AT","BE","BG","HR","CY","EE","FI","FR","DE","GR","IE","IT","LV","LT","LU","MT","NL","PT","SK","SI","ES","AD","MC","SM","VA","XK","ME","CZ","DK","HU","IS","NO","PL","RO","SE","CH","TR","US","CA","AU","NZ"]);
const ALLOWED_SUITES = new Set(["provisioning","api","workflow","regression","localization","failure"]);
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
  const accountCount = int(body?.accountCount, 1, 10000);
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
  if (accountCount === null) errors.push("Account count must be from 1 to 10,000.");
  if (concurrency === null) errors.push("Concurrency must be from 1 to 100.");
  if (!suites.length) errors.push("Choose at least one test suite.");
  if (!Array.isArray(body?.variations) || body.variations.length < 1 || body.variations.length > MAX_VARIATIONS) errors.push("Add between 1 and 20 variations.");
  if (variations.length && testsPerVariation !== null && totalCampaignTests !== null && variations.length * testsPerVariation > totalCampaignTests) errors.push("Tests per variation multiplied by the number of variations cannot exceed the total campaign test count.");
  return { errors, value: { name, countryCode, scenario, totalCampaignTests, testsPerVariation, accountCount, concurrency, suites, variations } };
}

export async function GET() {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Not logged in." }, { status: 401 });
  if (!(await isTesterAdmin())) return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  try {
    const [campaigns, rawRuns] = await Promise.all([
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
          summary->>'testType' AS "testType", summary->>'loadRequestCount' AS "loadRequestCount"
        FROM qa_test_runs ORDER BY started_at DESC LIMIT 50
      `)
    ]);
    const runs = rawRuns.map(run => ({ ...run, durationMs: run.durationMs === null ? null : Number(run.durationMs) }));
    return NextResponse.json({ campaigns, runs, executionEnabled: false }, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    console.error("QA campaign history unavailable", error);
    return NextResponse.json({ error: "Campaign storage is not available yet. Apply the reviewed QA campaign metadata migration to staging before using this page." }, { status: 503 });
  }
}

export async function POST(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Not logged in." }, { status: 401 });
  if (!(await isTesterAdmin())) return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  let body: any;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Request body must be JSON." }, { status: 400 }); }
  const { errors, value } = validate(body);
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
