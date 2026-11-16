import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { isTesterAdmin } from "@/lib/testerAdmin";
import { prisma } from "@/lib/prisma";
import { enforceRateLimit } from "@/lib/rateLimit";
import { withApiMetrics } from "@/lib/apiMetrics";
import { normalizeEmail } from "@/lib/identityText";
import { toE164ForMarket } from "@/lib/phoneVerification";

export const dynamic = "force-dynamic";

/*
 * Admin support lookup (view only). Lets an administrator find an account when its
 * owner asks support for help. Every lookup is written to the admin audit log with the
 * kind of search and how many accounts matched, never the search text itself.
 * Password hashes, session data, one-time codes and tokens are never selected.
 */

const MAX_RESULTS = 10;

function searchKind(query: string) {
  if (query.includes("@")) return "email" as const;
  if (/^[A-Za-z]{2,6}-\d{4,}$/.test(query)) return "account_id" as const;
  if (/^[+\d][\d\s().-]{5,}$/.test(query)) return "phone" as const;
  return "company" as const;
}

async function GETHandler(request: Request) {
  if (!(await isTesterAdmin())) {
    const session = await getServerSession(authOptions);
    return NextResponse.json({ error: session ? "Admin access required." : "Not logged in." }, { status: session ? 403 : 401 });
  }
  const adminSession = await getServerSession(authOptions);
  const actorCandidate = typeof adminSession?.user?.email === "string" ? adminSession.user.email : "";
  const actor = /^[a-zA-Z0-9._@-]{3,100}$/.test(actorCandidate) ? actorCandidate : "tester-admin-api";
  const limited = await enforceRateLimit(request, { scope: "admin-support-lookup", limit: 60, windowMs: 60 * 60 * 1000 });
  if (limited) return limited;

  const query = (new URL(request.url).searchParams.get("q") ?? "").trim().slice(0, 120);
  if (query.length < 3) {
    return NextResponse.json({ error: "Enter at least 3 characters: an email, phone number, account ID (like ABC-12345678) or company name." }, { status: 400 });
  }

  const kind = searchKind(query);
  let where: Record<string, unknown>;
  if (kind === "email") {
    const email = normalizeEmail(query);
    if (!email) return NextResponse.json({ accounts: [] });
    where = { users: { some: { email: { equals: email, mode: "insensitive" } } } };
  } else if (kind === "account_id") {
    where = { displayId: query.toUpperCase() };
  } else if (kind === "phone") {
    const candidates = [toE164ForMarket(query, "IN"), toE164ForMarket(query, "GB")].filter((value): value is string => Boolean(value));
    where = { users: { some: { OR: [{ phone: query }, ...(candidates.length ? [{ phoneE164: { in: candidates } }] : [])] } } };
  } else {
    where = { companyName: { contains: query, mode: "insensitive" } };
  }

  const accounts = await prisma.account.findMany({
    where,
    take: MAX_RESULTS,
    orderBy: { createdAt: "desc" },
    select: {
      id: true, displayId: true, companyName: true, country: true, currency: true, planType: true,
      type: true, isSoleTrader: true, isTester: true, createdAt: true, deletionRequestedAt: true,
      verificationStatus: true, companyVerificationStatus: true, phoneVerifiedAt: true,
      users: { select: { name: true, email: true, emailVerifiedAt: true, phone: true, role: true, personVerifiedAt: true, createdAt: true } },
      vehicles: { select: { regPlate: true, vehicleType: true, verificationStatus: true, rejectionReason: true } },
      notifications: { orderBy: { createdAt: "desc" }, take: 8, select: { type: true, title: true, createdAt: true, readAt: true } },
    },
  });

  const ids = accounts.map((account) => account.id);
  const jobs = ids.length
    ? await prisma.job.findMany({
        where: { OR: [{ posterId: { in: ids } }, { acceptedById: { in: ids } }] },
        orderBy: { createdAt: "desc" },
        take: 40,
        select: { id: true, status: true, pickup: true, dropoff: true, createdAt: true, posterId: true, acceptedById: true },
      })
    : [];

  await prisma.adminAuditEvent.create({
    data: {
      actor,
      action: "SUPPORT_ACCOUNT_LOOKUP",
      entityType: "Account",
      entityId: accounts.length === 1 ? accounts[0].id : null,
      market: accounts.length === 1 ? accounts[0].country : null,
      details: { searchKind: kind, matched: accounts.length },
    },
  });

  return NextResponse.json({
    accounts: accounts.map((account) => ({
      ...account,
      recentJobs: jobs
        .filter((job) => job.posterId === account.id || job.acceptedById === account.id)
        .slice(0, 6)
        .map((job) => ({ id: job.id, status: job.status, pickup: job.pickup, dropoff: job.dropoff, createdAt: job.createdAt, role: job.posterId === account.id ? "poster" : "driver" })),
    })),
  }, { headers: { "Cache-Control": "private, no-store" } });
}

export const GET = withApiMetrics("/api/admin/support/account", GETHandler);
