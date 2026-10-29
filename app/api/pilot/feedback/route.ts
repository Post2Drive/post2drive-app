import { randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { enforceRateLimit } from "@/lib/rateLimit";
import { readBoundedJson } from "@/lib/requestBody";
import { prisma } from "@/lib/prisma";
import { withApiMetrics } from "@/lib/apiMetrics";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function pilotEnvironmentEnabled() {
  const qaEnvironment = process.env.POST2DRIVE_QA_ENVIRONMENT?.trim().toLowerCase();
  const currentEnvironmentId = process.env.RAILWAY_ENVIRONMENT_ID?.trim();
  const allowedEnvironmentId = process.env.POST2DRIVE_QA_ALLOWED_ENVIRONMENT_ID?.trim();
  return qaEnvironment === "staging" &&
    Boolean(currentEnvironmentId) &&
    Boolean(allowedEnvironmentId) &&
    currentEnvironmentId === allowedEnvironmentId;
}

async function currentPilotAccount() {
  if (!pilotEnvironmentEnabled()) return null;
  const session = await getServerSession(authOptions);
  const accountId = (session?.user as any)?.accountId as string | undefined;
  if (!accountId) return null;
  const account = await prisma.account.findUnique({
    where: { id: accountId, deletionRequestedAt: null },
    select: { id: true, displayId: true, country: true, currency: true, isTester: true },
  });
  if (!account || !account.isTester || account.country !== "GB" || account.currency !== "GBP") return null;
  return account;
}

function routeTemplate(value: unknown) {
  if (typeof value !== "string" || !value.startsWith("/") || value.length > 400) return "/";
  const parts = value.split("/").filter(Boolean).slice(0, 10);
  return "/" + parts.map(part => {
    if (/^(?:c[a-z0-9]{20,}|[0-9a-f]{8}-[0-9a-f-]{27,}|[0-9a-f]{16,})$/i.test(part)) return "[id]";
    if (part.length > 80) return "[segment]";
    return part.replace(/[^a-zA-Z0-9._~-]/g, "");
  }).filter(Boolean).join("/");
}

function shortText(value: unknown, limit: number) {
  return typeof value === "string" ? value.trim().slice(0, limit) : "";
}

function boundedInt(value: unknown, max: number) {
  const number = Number(value);
  return Number.isInteger(number) && number >= 0 && number <= max ? number : null;
}

function cleanClient(value: unknown, route: string) {
  const input = value && typeof value === "object" && !Array.isArray(value)
    ? value as Record<string, unknown>
    : {};
  const allow = (v: unknown, options: string[], fallback = "unknown") =>
    typeof v === "string" && options.includes(v) ? v : fallback;
  const viewportWidth = boundedInt(input.viewportWidth, 10000);
  const viewportHeight = boundedInt(input.viewportHeight, 10000);
  const screenWidth = boundedInt(input.screenWidth, 10000);
  const screenHeight = boundedInt(input.screenHeight, 10000);
  const visualViewportWidth = boundedInt(input.visualViewportWidth, 10000);
  const visualViewportHeight = boundedInt(input.visualViewportHeight, 10000);
  const touchPoints = boundedInt(input.touchPoints, 100);
  const pixelRatioRaw = Number(input.pixelRatio);
  const pixelRatio = Number.isFinite(pixelRatioRaw) ? Math.max(0.5, Math.min(8, Math.round(pixelRatioRaw * 100) / 100)) : null;
  return {
    route,
    viewportWidth,
    viewportHeight,
    screenWidth,
    screenHeight,
    visualViewportWidth,
    visualViewportHeight,
    pixelRatio,
    orientation: allow(input.orientation, ["portrait", "landscape", "unknown"]),
    browserFamily: allow(input.browserFamily, ["Chrome", "Edge", "Firefox", "Safari", "Samsung Internet", "WebView", "Other", "unknown"]),
    osFamily: allow(input.osFamily, ["Android", "iOS", "Windows", "macOS", "Linux", "ChromeOS", "Other", "unknown"]),
    platform: allow(input.platform, ["Android", "iOS", "Windows", "macOS", "Linux", "ChromeOS", "Other", "unknown"]),
    language: allow(input.language, ["en-GB", "en-US", "en-IN", "en", "other", "unknown"]),
    touchPoints,
    online: typeof input.online === "boolean" ? input.online : null,
    standalone: typeof input.standalone === "boolean" ? input.standalone : null,
    colorScheme: allow(input.colorScheme, ["light", "dark", "no-preference", "unknown"]),
    reducedMotion: typeof input.reducedMotion === "boolean" ? input.reducedMotion : null,
  };
}

async function GETHandler() {
  const account = await currentPilotAccount();
  if (!account) return NextResponse.json({ enabled: false }, { status: 404, headers: { "Cache-Control": "no-store" } });
  return NextResponse.json({
    enabled: true,
    participantId: account.displayId,
    message: "Pilot diagnostics are enabled for this approved UK test account.",
  }, { headers: { "Cache-Control": "no-store" } });
}

async function POSTHandler(req: Request) {
  const account = await currentPilotAccount();
  if (!account) return NextResponse.json({ error: "Pilot feedback is available only to approved UK tester accounts on the allow-listed staging environment." }, { status: 404 });

  const parsed = await readBoundedJson(req, 8 * 1024);
  if (!parsed.ok) return NextResponse.json({ error: parsed.status === 413 ? "Feedback is too large." : "Send a valid JSON report." }, { status: parsed.status });
  if (!parsed.value || typeof parsed.value !== "object" || Array.isArray(parsed.value)) {
    return NextResponse.json({ error: "Report must be a JSON object." }, { status: 400 });
  }

  const body = parsed.value as Record<string, unknown>;
  const kind = body.kind === "view" ? "view" : body.kind === "feedback" ? "feedback" : "";
  if (!kind) return NextResponse.json({ error: "Unsupported pilot event." }, { status: 400 });
  const limit = await enforceRateLimit(req, {
    scope: kind === "view" ? "pilot-view" : "pilot-feedback",
    identity: account.id,
    limit: kind === "view" ? 120 : 10,
    windowMs: 60 * 60 * 1000,
  });
  if (limit) return limit;

  const route = routeTemplate(body.route);
  const client = cleanClient(body.client, route);
  const eventId = randomUUID();
  const reference = "PILOT-" + eventId.replace(/-/g, "").slice(0, 10).toUpperCase();

  const metadata: Record<string, unknown> = { reference, kind, route, client };
  if (kind === "feedback") {
    const category = shortText(body.category, 30);
    const severity = shortText(body.severity, 12);
    const task = shortText(body.task, 50);
    const description = shortText(body.description, 1800);
    const steps = shortText(body.steps, 1400);
    if (!["layout", "navigation", "workflow", "bug", "performance", "accessibility", "other"].includes(category)) {
      return NextResponse.json({ error: "Choose a valid feedback category." }, { status: 400 });
    }
    if (!["low", "medium", "high", "blocking"].includes(severity)) {
      return NextResponse.json({ error: "Choose a valid severity." }, { status: 400 });
    }
    if (!["signup-login", "profile", "job-posting", "job-search", "bidding", "acceptance", "pickup", "delivery", "notifications", "other"].includes(task)) {
      return NextResponse.json({ error: "Choose a valid pilot task." }, { status: 400 });
    }
    if (description.length < 5) return NextResponse.json({ error: "Describe what happened in at least 5 characters." }, { status: 400 });
    metadata.category = category;
    metadata.severity = severity;
    metadata.task = task;
    metadata.description = description;
    metadata.steps = steps;
  }

  await prisma.platformUsageEvent.create({
    data: {
      accountId: account.id,
      eventType: kind === "view" ? "pilot_view" : "pilot_feedback",
      eventKey: "pilot-" + kind + ":" + eventId,
      metadata: metadata as any,
    },
  });

  return NextResponse.json({ success: true, reference, message: kind === "view" ? "Layout diagnostics recorded." : "Pilot feedback submitted." }, { status: 201, headers: { "Cache-Control": "no-store" } });
}

export const GET = withApiMetrics("/api/pilot/feedback", GETHandler);
export const POST = withApiMetrics("/api/pilot/feedback", POSTHandler);
