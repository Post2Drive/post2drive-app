import { withApiMetrics } from "@/lib/apiMetrics";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isTesterAdmin } from "@/lib/testerAdmin";

export const dynamic = "force-dynamic";

async function GETHandler(request: Request) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Not logged in." }, { status: 401 });
  if (!(await isTesterAdmin())) return NextResponse.json({ error: "Admin access required." }, { status: 403 });

  const url = new URL(request.url);
  const requestedDays = Number(url.searchParams.get("days") || 7);
  const days = [1, 7, 30].includes(requestedDays) ? requestedDays : 7;

  try {
    const [
      overviewRows, accountTypes, verificationStatuses, subscriptionStatuses,
      jobStatuses, jobPriceModes, usageEvents, jobActivity, vehicleSummary,
      ratingSummary, jobPaymentSummary, subscriptionPayments, endpointPerformance,
      recentFailures, accountGrowth, apiHourly, qaRuns, latestQaFailures, busiestAccounts
    ] = await Promise.all([
      prisma.$queryRawUnsafe<any[]>(`
        SELECT
          count(*) FILTER (WHERE qa.account_id IS NULL)::int AS "totalAccounts",
          count(*) FILTER (WHERE qa.account_id IS NULL AND a."createdAt" >= now() - interval '24 hours')::int AS "new24h",
          count(*) FILTER (WHERE qa.account_id IS NULL AND a."createdAt" >= now() - interval '7 days')::int AS "new7d",
          count(*) FILTER (WHERE qa.account_id IS NULL AND a."createdAt" >= now() - interval '30 days')::int AS "new30d",
          count(*) FILTER (WHERE qa.account_id IS NULL AND a."lastActivityAt" >= now() - interval '24 hours')::int AS "active24h",
          count(*) FILTER (WHERE qa.account_id IS NULL AND a."lastActivityAt" >= now() - interval '7 days')::int AS "active7d",
          count(*) FILTER (WHERE qa.account_id IS NULL AND a."lastActivityAt" >= now() - interval '30 days')::int AS "active30d",
          (SELECT count(*)::int FROM "User" u JOIN "Account" ua ON ua.id=u."accountId" LEFT JOIN qa_test_accounts uq ON uq.account_id=ua.id WHERE uq.account_id IS NULL) AS "totalUsers",
          (SELECT count(*)::int FROM "Job" j JOIN "Account" a2 ON a2.id=j."posterId" LEFT JOIN qa_test_accounts jq ON jq.account_id=a2.id WHERE jq.account_id IS NULL AND j."createdAt" >= now() - interval '24 hours') AS "jobs24h",
          (SELECT count(*)::int FROM "Job" j JOIN "Account" a2 ON a2.id=j."posterId" LEFT JOIN qa_test_accounts jq ON jq.account_id=a2.id WHERE jq.account_id IS NULL AND j."createdAt" >= now() - interval '7 days') AS "jobs7d"
        FROM "Account" a LEFT JOIN qa_test_accounts qa ON qa.account_id=a.id
      `),
      prisma.$queryRawUnsafe<any[]>(`SELECT a.type::text AS label, count(*)::int AS count FROM "Account" a LEFT JOIN qa_test_accounts q ON q.account_id=a.id WHERE q.account_id IS NULL GROUP BY a.type ORDER BY count DESC`),
      prisma.$queryRawUnsafe<any[]>(`SELECT a."verificationStatus"::text AS label, count(*)::int AS count FROM "Account" a LEFT JOIN qa_test_accounts q ON q.account_id=a.id WHERE q.account_id IS NULL GROUP BY a."verificationStatus" ORDER BY count DESC`),
      prisma.$queryRawUnsafe<any[]>(`SELECT a."subscriptionStatus"::text AS label, count(*)::int AS count FROM "Account" a LEFT JOIN qa_test_accounts q ON q.account_id=a.id WHERE q.account_id IS NULL GROUP BY a."subscriptionStatus" ORDER BY count DESC`),
      prisma.$queryRawUnsafe<any[]>(`SELECT j.status::text AS label, count(*)::int AS count FROM "Job" j JOIN "Account" a ON a.id=j."posterId" LEFT JOIN qa_test_accounts q ON q.account_id=a.id WHERE q.account_id IS NULL GROUP BY j.status ORDER BY count DESC`),
      prisma.$queryRawUnsafe<any[]>(`SELECT j."priceMode"::text AS label, count(*)::int AS count FROM "Job" j JOIN "Account" a ON a.id=j."posterId" LEFT JOIN qa_test_accounts q ON q.account_id=a.id WHERE q.account_id IS NULL GROUP BY j."priceMode" ORDER BY count DESC`),
      prisma.$queryRawUnsafe<any[]>(`SELECT u."eventType" AS label, count(*)::int AS count FROM "PlatformUsageEvent" u LEFT JOIN qa_test_accounts q ON q.account_id=u."accountId" WHERE q.account_id IS NULL AND u."createdAt" >= now() - ($1::int * interval '1 day') GROUP BY u."eventType" ORDER BY count DESC LIMIT 15`, String(days)),
      prisma.$queryRawUnsafe<any[]>(`SELECT ja.action AS label, count(*)::int AS count FROM "JobActivity" ja JOIN "Job" j ON j.id=ja."jobId" JOIN "Account" a ON a.id=j."posterId" LEFT JOIN qa_test_accounts q ON q.account_id=a.id WHERE q.account_id IS NULL AND ja."createdAt" >= now() - ($1::int * interval '1 day') GROUP BY ja.action ORDER BY count DESC LIMIT 20`, String(days)),
      prisma.$queryRawUnsafe<any[]>(`SELECT count(*)::int AS total, count(*) FILTER (WHERE v."verificationStatus"='verified')::int AS verified, count(*) FILTER (WHERE v."motValidUntil" IS NOT NULL AND v."motValidUntil" < now())::int AS "motExpired", count(*) FILTER (WHERE v."insuranceValidUntil" IS NOT NULL AND v."insuranceValidUntil" < now())::int AS "insuranceExpired", count(*) FILTER (WHERE v."motValidUntil" >= now() AND v."motValidUntil" < now()+interval '30 days')::int AS "motExpiring30d", count(*) FILTER (WHERE v."insuranceValidUntil" >= now() AND v."insuranceValidUntil" < now()+interval '30 days')::int AS "insuranceExpiring30d" FROM "Vehicle" v LEFT JOIN qa_test_accounts q ON q.account_id=v."accountId" WHERE q.account_id IS NULL`),
      prisma.$queryRawUnsafe<any[]>(`SELECT count(*)::int AS total, round(avg(r.stars)::numeric,2)::float AS "averageStars", count(*) FILTER (WHERE r."createdAt" >= now() - ($1::int * interval '1 day'))::int AS "windowCount" FROM "Rating" r LEFT JOIN qa_test_accounts q ON q.account_id=r."raterId" WHERE q.account_id IS NULL`, String(days)),
      prisma.$queryRawUnsafe<any[]>(`SELECT count(*) FILTER (WHERE j."paidMarkedAt" IS NOT NULL)::int AS "markedPaid", count(*) FILTER (WHERE j."receivedConfirmedAt" IS NOT NULL)::int AS "receiptConfirmed", count(*) FILTER (WHERE j.status='completed' AND j."paidMarkedAt" IS NULL)::int AS "completedUnmarked", count(*) FILTER (WHERE j.status='completed' AND j."paidMarkedAt" IS NOT NULL AND j."receivedConfirmedAt" IS NULL)::int AS "paidAwaitingReceipt" FROM "Job" j JOIN "Account" a ON a.id=j."posterId" LEFT JOIN qa_test_accounts q ON q.account_id=a.id WHERE q.account_id IS NULL`),
      prisma.$queryRawUnsafe<any[]>(`SELECT sp.status AS label, sp.currency, count(*)::int AS count, coalesce(sum(sp."amountPence"),0)::bigint AS "amountPence" FROM "SubscriptionPayment" sp LEFT JOIN qa_test_accounts q ON q.account_id=sp."accountId" WHERE q.account_id IS NULL GROUP BY sp.status,sp.currency ORDER BY count DESC`),
      prisma.$queryRawUnsafe<any[]>(`SELECT route, method, count(*)::int AS count, count(*) FILTER (WHERE "statusCode">=500)::int AS "serverErrors", count(*) FILTER (WHERE "statusCode">=400 AND "statusCode"<500)::int AS "clientErrors", round(avg("durationMs"))::int AS "avgMs", percentile_disc(0.50) WITHIN GROUP (ORDER BY "durationMs")::int AS "p50Ms", percentile_disc(0.95) WITHIN GROUP (ORDER BY "durationMs")::int AS "p95Ms", max("durationMs")::int AS "maxMs", max("createdAt") AS "lastSeenAt" FROM "ApiRequestMetric" WHERE "qaRunId" IS NULL AND "createdAt" >= now() - ($1::int * interval '1 day') GROUP BY route, method ORDER BY percentile_disc(0.95) WITHIN GROUP (ORDER BY "durationMs") DESC LIMIT 30`, String(days)),
      prisma.$queryRawUnsafe<any[]>(`SELECT id, method, route, "statusCode", "durationMs", "createdAt" FROM "ApiRequestMetric" WHERE "qaRunId" IS NULL AND "statusCode">=500 AND "createdAt" >= now() - ($1::int * interval '1 day') ORDER BY "createdAt" DESC LIMIT 25`, String(days)),
      prisma.$queryRawUnsafe<any[]>(`SELECT date_trunc('day',a."createdAt") AS day, count(*)::int AS count FROM "Account" a LEFT JOIN qa_test_accounts q ON q.account_id=a.id WHERE q.account_id IS NULL AND a."createdAt" >= now()-interval '30 days' GROUP BY day ORDER BY day`),
      prisma.$queryRawUnsafe<any[]>(`SELECT date_trunc('hour',"createdAt") AS hour, count(*)::int AS total, count(*) FILTER (WHERE "statusCode">=500)::int AS errors FROM "ApiRequestMetric" WHERE "qaRunId" IS NULL AND "createdAt" >= now()-interval '24 hours' GROUP BY hour ORDER BY hour`),
      prisma.$queryRawUnsafe<any[]>(`SELECT id,status,target_accounts AS "targetAccounts",created_accounts AS "createdAccounts",successful_checks AS "successfulChecks",failed_checks AS "failedChecks",duration_ms AS "durationMs",started_at AS "startedAt",finished_at AS "finishedAt",summary FROM qa_test_runs ORDER BY started_at DESC LIMIT 100`),
      prisma.$queryRawUnsafe<any[]>(`SELECT e.run_id AS "runId",r.summary->>'country' AS country,r.status AS "runStatus",e.scenario,e.action,e.path,e.expected_statuses AS expected,e."actual_status" AS actual,count(*)::int AS count FROM qa_test_events e JOIN qa_test_runs r ON r.id=e.run_id WHERE e.run_id IN (SELECT id FROM qa_test_runs ORDER BY started_at DESC LIMIT 100) AND e.passed=false GROUP BY e.run_id,r.summary->>'country',r.status,e.scenario,e.action,e.path,e.expected_statuses,e."actual_status" ORDER BY max(r.started_at) DESC,count(*) DESC LIMIT 200`),
      prisma.$queryRawUnsafe<any[]>(`SELECT a.id,a."companyName",a.type::text AS type,a."lastActivityAt",a."createdAt",count(DISTINCT ja.id)::int AS "activityCount" FROM "Account" a LEFT JOIN qa_test_accounts q ON q.account_id=a.id LEFT JOIN "JobActivity" ja ON ja."actorId"=a.id AND ja."createdAt">=now()-($1::int*interval '1 day') WHERE q.account_id IS NULL GROUP BY a.id ORDER BY "activityCount" DESC,a."lastActivityAt" DESC LIMIT 15`, String(days))
    ]);

    const asNumber = (v: any) => Number(v ?? 0);
    const overviewRow = overviewRows[0] || {};
    const overview = Object.fromEntries(Object.entries(overviewRow).map(([key, value]) => [key, asNumber(value)]));
    const normaliseRows = (rows: any[]) => rows.map(row => Object.fromEntries(Object.entries(row).map(([key, value]) => [key, typeof value === "bigint" ? Number(value) : value instanceof Date ? value.toISOString() : value])));
    const metrics = normaliseRows(endpointPerformance).map((row: any) => ({
      ...row,
      errorRate: row.count ? Math.round(((row.serverErrors + row.clientErrors) / row.count) * 1000) / 10 : 0
    }));
    return NextResponse.json({
      generatedAt: new Date().toISOString(), windowDays: days, overview,
      accountTypes: normaliseRows(accountTypes), verificationStatuses: normaliseRows(verificationStatuses),
      subscriptionStatuses: normaliseRows(subscriptionStatuses), jobStatuses: normaliseRows(jobStatuses),
      jobPriceModes: normaliseRows(jobPriceModes), usageEvents: normaliseRows(usageEvents),
      jobActivity: normaliseRows(jobActivity), vehicleSummary: normaliseRows(vehicleSummary)[0],
      ratingSummary: normaliseRows(ratingSummary)[0], jobPaymentSummary: normaliseRows(jobPaymentSummary)[0],
      subscriptionPayments: normaliseRows(subscriptionPayments), endpointPerformance: metrics,
      recentFailures: normaliseRows(recentFailures), accountGrowth: normaliseRows(accountGrowth),
      apiHourly: normaliseRows(apiHourly), qaRuns: normaliseRows(qaRuns), latestQaFailures: normaliseRows(latestQaFailures),
      busiestAccounts: normaliseRows(busiestAccounts)
    });
  } catch (error) {
    console.error("Admin performance dashboard query failed:", error);
    return NextResponse.json({ error: "Unable to load performance metrics. Check the database migration and server logs." }, { status: 500 });
  }
}

export const GET = withApiMetrics("/api/admin/performance", GETHandler);
