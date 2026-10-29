import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { enforceRateLimit } from "@/lib/rateLimit";
import { readBoundedJson } from "@/lib/requestBody";
import { isQaRunnerEnabled } from "@/lib/qaRunnerGuard";
import { isUkAccount } from "@/lib/uk";
import { withApiMetrics } from "@/lib/apiMetrics";

export const runtime = "nodejs";

const CATEGORIES = new Set(["layout", "navigation", "registration", "jobs", "bids", "lifecycle", "accessibility", "performance", "other"]);
const SEVERITIES = new Set(["blocker", "major", "minor", "suggestion"]);

function text(value: unknown, max: number) {
  return typeof value === "string"
    ? value.replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, " ").trim().slice(0, max)
    : "";
}

function numberField(value: unknown, min: number, max: number) {
  if (typeof value !== "number" || !Number.isFinite(value)) return undefined;
  return Math.max(min, Math.min(max, Math.round(value * 100) / 100));
}

function diagnosticsOnly(value: unknown): Record<string, string | number | boolean> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const d = value as Record<string, unknown>;
  const output: Record<string, string | number | boolean> = {};
  const numeric: Record<string, [number, number]> = {
    viewportWidth: [0, 10000], viewportHeight: [0, 10000], documentWidth: [0, 20000],
    documentHeight: [0, 50000], horizontalOverflowPx: [0, 20000], screenWidth: [0, 10000],
    screenHeight: [0, 10000], devicePixelRatio: [0.25, 10], colorDepth: [0, 128],
    visualViewportWidth: [0, 10000], visualViewportHeight: [0, 10000],
    visualViewportScale: [0.1, 10], safeAreaTop: [0, 500], safeAreaBottom: [0, 500],
  };
  for (const [key, range] of Object.entries(numeric)) {
    const n = numberField(d[key], range[0], range[1]);
    if (n !== undefined) output[key] = n;
  }
  for (const [key, max] of [["capturedAt", 40], ["route", 180], ["orientation", 40], ["language", 40],
    ["timezone", 100], ["userAgent", 400], ["platform", 100], ["colorScheme", 20]] as const) {
    const value = text(d[key], max);
    if (value) output[key] = value;
  }
  for (const key of ["online", "standalone", "nativeShell", "reducedMotion"] as const) {
    if (typeof d[key] === "boolean") output[key] = d[key];
  }
  return output;
}

async function POSTHandler(req: Request) {
  if (!isQaRunnerEnabled()) return NextResponse.json({ error: "Student pilot feedback is only enabled in the explicitly allow-listed staging environment." }, { status: 404 });
  const session = await getServerSession(authOptions);
  const accountId = (session?.user as any)?.accountId as string | undefined;
  if (!accountId) return NextResponse.json({ error: "Authentication required." }, { status: 401 });

  const account = await prisma.account.findUnique({
    where: { id: accountId },
    select: { displayId: true, country: true, currency: true, isTester: true },
  });
  if (!account || !account.isTester || !isUkAccount(account)) {
    return NextResponse.json({ error: "This feedback form is restricted to approved UK student-pilot accounts." }, { status: 403 });
  }
  const limit = await enforceRateLimit(req, { scope: "pilot-feedback", identity: accountId, limit: 20, windowMs: 60 * 60 * 1000 });
  if (limit) return limit;

  const parsed = await readBoundedJson(req, 16 * 1024);
  if (!parsed.ok) return NextResponse.json({ error: parsed.status === 413 ? "Feedback is too large." : "Feedback must be valid JSON." }, { status: parsed.status });
  if (!parsed.value || typeof parsed.value !== "object" || Array.isArray(parsed.value)) return NextResponse.json({ error: "Provide a feedback object." }, { status: 400 });

  const body = parsed.value as Record<string, unknown>;
  const category = text(body.category, 40);
  const severity = text(body.severity, 20);
  const title = text(body.title, 120);
  const description = text(body.description, 3000);
  const diagnostics = diagnosticsOnly(body.diagnostics);
  if (!CATEGORIES.has(category) || !SEVERITIES.has(severity) || title.length < 3 || description.length < 10 || body.consent !== true || !diagnostics) {
    return NextResponse.json({ error: "Choose a valid category and impact, provide a title and description, and consent to the diagnostics." }, { status: 400 });
  }

  const referenceId = randomUUID();
  await prisma.adminAuditEvent.create({
    data: {
      actor: "pilot:" + account.displayId,
      action: "pilot_feedback_submitted",
      entityType: "pilot_feedback",
      entityId: referenceId,
      market: "GB",
      details: {
        schemaVersion: 1,
        category,
        severity,
        title,
        description,
        diagnostics,
        consent: true,
        submittedAt: new Date().toISOString(),
      },
    },
  });
  return NextResponse.json({ success: true, referenceId }, { status: 201 });
}

export const POST = withApiMetrics("/api/pilot/feedback", POSTHandler);
