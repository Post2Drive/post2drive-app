import { NextResponse } from "next/server";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

/**
 * Public, non-sensitive readiness endpoint for Railway and external smoke tests.
 * Returns healthy only when the app can reach PostgreSQL; never returns secrets
 * or raw database errors.
 */
export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json(
      { status: "ok", service: "post2drive-web", checks: { database: "ok" } },
      { status: 200, headers: { "Cache-Control": "no-store" } },
    );
  } catch {
    return NextResponse.json(
      { status: "unavailable", service: "post2drive-web", checks: { database: "failed" } },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
