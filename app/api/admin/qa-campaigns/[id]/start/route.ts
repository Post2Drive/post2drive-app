import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { randomUUID } from "node:crypto";
import { authOptions } from "@/lib/auth";
import { isTesterAdmin } from "@/lib/testerAdmin";
import { isQaRunnerEnabled } from "@/lib/qaRunnerGuard";
import { prisma } from "@/lib/prisma";
import { getMarket } from "@/lib/market";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const SUITE_TYPES: Record<string, "synthetic-accounts" | "api-load" | "workflow-e2e"> = {
  provisioning: "synthetic-accounts",
  api: "api-load",
  workflow: "workflow-e2e",
  regression: "workflow-e2e",
  localization: "workflow-e2e",
  failure: "workflow-e2e",
};

export async function POST(request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Not logged in." }, { status: 401 });
  if (!(await isTesterAdmin())) return NextResponse.json({ error: "Admin access required." }, { status: 403 });
  if (!isQaRunnerEnabled()) return NextResponse.json({ error: "Campaign execution is available only on the allow-listed staging environment." }, { status: 404 });

  let body: any;
  try { body = await request.json(); } catch { return NextResponse.json({ error: "Request body must be JSON." }, { status: 400 }); }
  if (body?.target !== "staging" || body?.confirm !== "RUN_QA_CAMPAIGN_ON_STAGING") {
    return NextResponse.json({ error: "Explicit staging target and RUN_QA_CAMPAIGN_ON_STAGING confirmation are required." }, { status: 400 });
  }
  const { id: campaignId } = await context.params;
  if (!/^campaign-[0-9a-f-]{36}$/i.test(campaignId)) return NextResponse.json({ error: "Invalid campaign identifier." }, { status: 400 });
  const base = (process.env.QA_BASE_URL || "").replace(/\/+$/, "");
  if (!base.startsWith("https://") || process.env.QA_ACCOUNT_COUNT !== "10000" || process.env.POST2DRIVE_QA_DATABASE_ISOLATED !== "true") {
    return NextResponse.json({ error: "Staging runner preflight is not satisfied." }, { status: 503 });
  }

  try {
    const result = await prisma.$transaction(async tx => {
      await tx.$queryRawUnsafe("SELECT pg_advisory_xact_lock(hashtext($1))", "post2drive-qa-run-queue");
      const rows = await tx.$queryRawUnsafe<any[]>(
        "SELECT id,name,country_code,scenario,total_campaign_tests,tests_per_variation,account_count,concurrency,suites,variations,status FROM qa_test_campaigns WHERE id=$1 FOR UPDATE",
        campaignId
      );
      const campaign = rows[0];
      if (!campaign) return { error: "Campaign not found.", status: 404 };
      if (campaign.status !== "draft") return { error: "Only a draft campaign can be started.", status: 409 };
      const market = getMarket(String(campaign.country_code || ""));
      if (!market) return { error: "Campaign market is unsupported.", status: 400 };
      const accountCount = Number(campaign.account_count);
      const concurrency = Number(campaign.concurrency);
      const testsPerVariation = Number(campaign.tests_per_variation);
      const totalCampaignTests = Number(campaign.total_campaign_tests);
      const suites = Array.isArray(campaign.suites) ? campaign.suites.filter((s: unknown): s is string => typeof s === "string" && SUITE_TYPES[s]) : [];
      const variations = Array.isArray(campaign.variations) ? campaign.variations : [];
      if (!Number.isInteger(accountCount) || accountCount < 500 || accountCount > 10000) return { error: "Execution requires 500–10,000 synthetic accounts.", status: 400 };
      if (!Number.isInteger(concurrency) || concurrency < 1 || concurrency > 100) return { error: "Concurrency must be between 1 and 100.", status: 400 };
      if (!Number.isInteger(testsPerVariation) || testsPerVariation < 1 || testsPerVariation > 25000 || !Number.isInteger(totalCampaignTests) || totalCampaignTests < 1 || totalCampaignTests > 25000) return { error: "Campaign test allocation is invalid.", status: 400 };
      if (!variations.length || !suites.length) return { error: "At least one variation and supported suite are required.", status: 400 };
      if (!suites.some(s => s !== "provisioning")) return { error: "Select at least one comparison suite in addition to provisioning.", status: 400 };
      if (suites.some(s => ["workflow","regression","localization","failure"].includes(s)) && accountCount !== 10000) {
        return { error: "The current workflow/regression/localization/failure runner requires 10,000 accounts. Use API-only suites for smaller pools.", status: 400 };
      }
      const active = await tx.$queryRawUnsafe<Array<{ id: string; status: string }>>(
        "SELECT id,status FROM qa_test_runs WHERE status IN ('queued','running') ORDER BY started_at DESC LIMIT 1"
      );
      if (active[0]) return { error: "Another QA run is already queued or running.", status: 409 };
      if (!suites.includes("provisioning")) {
        const pools = await tx.$queryRawUnsafe<Array<{ id: string }>>(
          "SELECT id FROM qa_test_runs WHERE status='completed' AND summary->>'testType'='synthetic-accounts' AND summary->>'country'=$1 AND target_accounts >= $2 ORDER BY finished_at DESC LIMIT 1",
          market.country, accountCount
        );
        if (!pools[0]) return { error: "A completed synthetic-account pool for this market and account count is required, or include the provisioning suite.", status: 409 };
      }

      const steps: Array<{ id: string; ordinal: number; variationId: string | null; variationName: string | null; suite: string; testType: string; iterations: number; concurrency?: number }> = [];
      let ordinal = 0;
      if (suites.includes("provisioning")) steps.push({ id: "step-" + randomUUID(), ordinal: ordinal++, variationId: null, variationName: null, suite: "provisioning", testType: "synthetic-accounts", iterations: accountCount });
      const comparisonSuites = suites.filter(s => s !== "provisioning");
      let allocatedIterations = 0;
      for (let i = 0; i < variations.length; i++) {
        const variation = variations[i] && typeof variations[i] === "object" ? variations[i] : {};
        const variationId = String(variation.id || "variation-" + (i + 1)).slice(0, 40);
        const variationName = String(variation.name || "Variation " + (i + 1)).slice(0, 80);
        const overrides = variation.overrides && typeof variation.overrides === "object" ? variation.overrides : {};
        const iterations = overrides.testIterations === undefined || overrides.testIterations === "" ? testsPerVariation : Number(overrides.testIterations);
        const variationConcurrency = overrides.concurrency === undefined || overrides.concurrency === "" ? concurrency : Number(overrides.concurrency);
        if (!Number.isInteger(iterations) || iterations < 1 || iterations > 25000) return { error: "Variation " + variationName + " test iterations must be from 1 to 25,000.", status: 400 };
        if (!Number.isInteger(variationConcurrency) || variationConcurrency < 1 || variationConcurrency > 100) return { error: "Variation " + variationName + " concurrency must be from 1 to 100.", status: 400 };
        allocatedIterations += iterations;
        for (const suite of comparisonSuites) {
          steps.push({ id: "step-" + randomUUID(), ordinal: ordinal++, variationId, variationName, suite, testType: SUITE_TYPES[suite], iterations, concurrency: variationConcurrency });
        }
      }
      if (allocatedIterations > totalCampaignTests) return { error: "Variation-specific test iterations exceed the total campaign test budget.", status: 400 };
      if (steps.length > 101) return { error: "Campaign exceeds the supported sequential step limit.", status: 400 };
      const first = steps[0];
      if (!first) return { error: "Campaign has no executable steps.", status: 400 };
      const runId = new Date().toISOString().replace(/[^0-9]/g, "").slice(0, 14) + "-" + randomUUID();
      await tx.$executeRawUnsafe(
        "UPDATE qa_test_campaigns SET status='running',execution_mode='staging_sequential',updated_at=now() WHERE id=$1 AND status='draft'",
        campaignId
      );
      for (const step of steps) {
        await tx.$executeRawUnsafe(
          "INSERT INTO qa_test_campaign_steps(id,campaign_id,ordinal,variation_id,variation_name,suite,test_type,test_iterations,account_count,concurrency,status) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11)",
          step.id, campaignId, step.ordinal, step.variationId, step.variationName, step.suite, step.testType, step.iterations, accountCount, step.concurrency ?? concurrency, step.id === first.id ? "queued" : "pending"
        );
      }
      const runSummary = {
        status: "queued", phase: "queued", country: market.country, testType: first.testType,
        testIterations: first.iterations, accountCount, concurrency: first.concurrency ?? concurrency, campaignId, campaignStepId: first.id,
        variationId: first.variationId, variationName: first.variationName, suite: first.suite,
        targetEnvironment: "staging", queuedAt: new Date().toISOString(),
      };
      await tx.$executeRawUnsafe(
        "INSERT INTO qa_test_runs(id,target_url,target_accounts,status,summary) VALUES($1,$2,$3,'queued',$4::jsonb)",
        runId, base, accountCount, JSON.stringify(runSummary)
      );
      await tx.$executeRawUnsafe(
        "UPDATE qa_test_campaign_steps SET run_id=$2,started_at=now() WHERE id=$1",
        first.id, runId
      );
      return { accepted: true, campaignId, runId, status: "queued", plannedSteps: steps.length, target: "staging" };
    }, { maxWait: 15000, timeout: 30000 });
    if ("error" in result) return NextResponse.json({ error: result.error }, { status: result.status });
    return NextResponse.json(result, { status: 202, headers: { "cache-control": "no-store" } });
  } catch (error) {
    console.error("Could not start QA campaign", error);
    return NextResponse.json({ error: "Could not start the campaign. Verify the staging migration and isolated QA worker." }, { status: 503 });
  }
}
