import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { isTesterAdmin } from "@/lib/testerAdmin";
import { prisma } from "@/lib/prisma";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function DELETE(_request: Request, context: { params: Promise<{ id: string }> }) {
  const session = await getServerSession(authOptions);
  if (!session) return NextResponse.json({ error: "Not logged in." }, { status: 401 });
  if (!(await isTesterAdmin())) return NextResponse.json({ error: "Admin access required." }, { status: 403 });

  const { id } = await context.params;
  if (!/^campaign-[0-9a-f-]{36}$/i.test(id)) {
    return NextResponse.json({ error: "Invalid campaign identifier." }, { status: 400 });
  }

  try {
    const result = await prisma.$transaction(async tx => {
      const rows = await tx.$queryRawUnsafe<Array<{ id: string; status: string }>>(
        "SELECT id,status FROM qa_test_campaigns WHERE id=$1 FOR UPDATE",
        id
      );
      const campaign = rows[0];
      if (!campaign) return { error: "Campaign not found.", status: 404 };
      if (campaign.status !== "draft") return { error: "Only unstarted draft campaigns can be deleted.", status: 409 };

      const steps = await tx.$queryRawUnsafe<Array<{ id: string }>>(
        "SELECT id FROM qa_test_campaign_steps WHERE campaign_id=$1 LIMIT 1",
        id
      );
      const linkedRuns = await tx.$queryRawUnsafe<Array<{ id: string }>>(
        "SELECT id FROM qa_test_runs WHERE summary->>'campaignId'=$1 LIMIT 1",
        id
      );
      if (steps.length || linkedRuns.length) {
        return { error: "This draft has execution history attached and cannot be deleted. QA history is preserved.", status: 409 };
      }

      await tx.$executeRawUnsafe("DELETE FROM qa_test_campaigns WHERE id=$1 AND status='draft'", id);
      return { deleted: true, id };
    }, { maxWait: 10000, timeout: 15000 });

    if ("error" in result) {
      return NextResponse.json({ error: result.error }, { status: result.status },);
    }
    return NextResponse.json(result, { headers: { "cache-control": "no-store" } });
  } catch (error) {
    console.error("Could not delete QA campaign draft.", { errorName: error instanceof Error ? error.name : "UnknownError" });
    return NextResponse.json({ error: "Could not delete the campaign draft. No QA history was intentionally removed." }, { status: 503 });
  }
}
