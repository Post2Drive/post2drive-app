import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { isTesterAdmin } from "@/lib/testerAdmin";

export const dynamic = "force-dynamic";
export async function GET() {
  if (!(await isTesterAdmin())) {
    const session = await getServerSession(authOptions);
    return NextResponse.json({ error: session ? "Admin access required." : "Not logged in." }, { status: session ? 403 : 401 });
  }
  const accounts = await prisma.account.findMany({
    where: { country: "IN", currency: "INR", marketResearch: { not: null }, deletionRequestedAt: null },
    select: { id: true, marketResearch: true, createdAt: true },
    orderBy: { createdAt: "desc" },
    take: 1000,
  });
  const counters: Record<string, Record<string, number>> = {};
  for (const account of accounts) {
    const answers = account.marketResearch && typeof account.marketResearch === "object" && !Array.isArray(account.marketResearch)
      ? account.marketResearch as Record<string, unknown> : {};
    for (const key of ["role", "currentDiscovery", "biggestChallenge", "preferredAccess"]) {
      const answer = typeof answers[key] === "string" ? answers[key] as string : "";
      if (!answer) continue;
      counters[key] ??= {};
      counters[key][answer] = (counters[key][answer] || 0) + 1;
    }
  }
  return NextResponse.json({ responseCount: accounts.length, counters });
}
