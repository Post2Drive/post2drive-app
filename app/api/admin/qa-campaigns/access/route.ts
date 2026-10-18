import { timingSafeEqual } from "node:crypto";
import { NextRequest, NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { enforceRateLimit } from "@/lib/rateLimit";
import { createOpsQaAdminSessionToken, OPS_QA_ADMIN_COOKIE } from "@/lib/testerAdmin";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function safeEqual(a: string, b: string) {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  return left.length === right.length && left.length > 0 && timingSafeEqual(left, right);
}

export async function POST(request: NextRequest) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Sign in to Post2Drive first." }, { status: 401 });
  if (request.headers.get("origin") !== request.nextUrl.origin) {
    return NextResponse.json({ error: "Same-origin request required." }, { status: 403 });
  }

  const limited = await enforceRateLimit(request, {
    scope: "qa-ops-admin-login",
    limit: 10,
    windowMs: 15 * 60 * 1000,
  });
  if (limited) return limited;

  const declaredLength = Number(request.headers.get("content-length") || 0);
  if (declaredLength > 4000) return NextResponse.json({ error: "Request too large." }, { status: 413 });

  let body: unknown;
  try { body = await request.json(); } catch {
    return NextResponse.json({ error: "Request body must be JSON." }, { status: 400 });
  }
  const candidate = body as { username?: unknown; password?: unknown };
  const username = typeof candidate?.username === "string" ? candidate.username.trim() : "";
  const password = typeof candidate?.password === "string" ? candidate.password : "";
  const expectedUsername = process.env.OPS_DASHBOARD_USERNAME?.trim() || "";
  const expectedPassword = process.env.OPS_DASHBOARD_PASSWORD || "";
  const secret = process.env.OPS_DASHBOARD_BRIDGE_SECRET || process.env.NEXTAUTH_SECRET || "";

  if (!expectedUsername || !expectedPassword || secret.length < 32) {
    return NextResponse.json({ error: "Ops Dashboard access is not configured for QA administration." }, { status: 503 });
  }
  if (!username || !password || username.length > 256 || password.length > 1024 ||
      !safeEqual(username, expectedUsername) || !safeEqual(password, expectedPassword)) {
    return NextResponse.json({ error: "Ops Dashboard credentials were not accepted." }, { status: 401 });
  }

  const email = session.user?.email?.trim().toLowerCase();
  if (!email) return NextResponse.json({ error: "The signed-in Post2Drive account has no email identity." }, { status: 403 });
  const token = createOpsQaAdminSessionToken(email);
  if (!token) return NextResponse.json({ error: "Could not create an admin session." }, { status: 503 });
  const response = NextResponse.json({ success: true, message: "Ops Dashboard access verified." }, {
    headers: { "cache-control": "no-store" },
  });
  response.cookies.set(OPS_QA_ADMIN_COOKIE, token.value, {
    httpOnly: true,
    secure: request.nextUrl.protocol === "https:",
    sameSite: "strict",
    path: "/",
    maxAge: token.maxAge,
  });
  return response;
}

export async function DELETE(request: NextRequest) {
  const response = NextResponse.json({ success: true }, { headers: { "cache-control": "no-store" } });
  response.cookies.set(OPS_QA_ADMIN_COOKIE, "", {
    httpOnly: true,
    secure: request.nextUrl.protocol === "https:",
    sameSite: "strict",
    path: "/",
    maxAge: 0,
  });
  return response;
}
