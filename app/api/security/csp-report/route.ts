import { NextResponse } from "next/server";
import { enforceRateLimit } from "@/lib/rateLimit";
import { readBoundedJson } from "@/lib/requestBody";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const NO_STORE = { "Cache-Control": "no-store" };
const MAX_REPORT_BYTES = 8 * 1024;

function shortString(value: unknown, max = 120): string {
  return typeof value === "string" ? value.replace(/[\r\n\t]/g, " ").slice(0, max) : "";
}

function blockedUriCategory(value: unknown): string {
  const uri = shortString(value, 512).toLowerCase();
  if (!uri) return "unknown";
  if (uri === "inline" || uri === "eval" || uri === "wasm-eval") return uri;
  if (uri.startsWith("data:")) return "data";
  if (uri.startsWith("blob:")) return "blob";
  try {
    const parsed = new URL(uri);
    if (parsed.origin === "null") return parsed.protocol.slice(0, 24);
    return parsed.origin;
  } catch {
    return "other";
  }
}

/**
 * CSP is report-only while external dependencies are audited. Accept only
 * bounded, rate-limited reports and log a small allowlisted summary; never
 * persist or log raw report bodies, source paths, query strings, or user data.
 */
export async function POST(request: Request) {
  const limited = await enforceRateLimit(request, {
    scope: "csp-report",
    limit: 60,
    windowMs: 60_000,
  });
  if (limited) return limited;

  const parsed = await readBoundedJson(request, MAX_REPORT_BYTES);
  if (!parsed.ok) {
    return NextResponse.json(
      { error: parsed.status === 413 ? "Report too large." : "Invalid report." },
      { status: parsed.status, headers: NO_STORE },
    );
  }

  const body = parsed.value as any;
  const report = body && typeof body === "object"
    ? (body["csp-report"] ?? body.body ?? body)
    : null;
  if (!report || typeof report !== "object" || Array.isArray(report)) {
    return NextResponse.json({ error: "Invalid report." }, { status: 400, headers: NO_STORE });
  }

  const summary = {
    disposition: shortString(report.disposition, 24) || "report",
    directive: shortString(report["effective-directive"] ?? report.effectiveDirective ?? report["violated-directive"] ?? report.violatedDirective, 100) || "unknown",
    blocked: blockedUriCategory(report["blocked-uri"] ?? report.blockedURL),
    status: Number.isInteger(Number(report["status-code"] ?? report.statusCode))
      ? Number(report["status-code"] ?? report.statusCode)
      : 0,
  };

  // Only fixed keys and bounded, sanitized values reach application logs.
  console.warn("CSP_REPORT", JSON.stringify(summary));
  return new NextResponse(null, { status: 204, headers: NO_STORE });
}
