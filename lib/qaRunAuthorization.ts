import { prisma } from "@/lib/prisma";
import { isQaRunnerEnabled } from "@/lib/qaRunnerGuard";

/**
 * Only a live, explicitly allow-listed staging QA run may bypass public
 * network throttles for its synthetic fixture traffic. A client-supplied
 * header alone is never sufficient.
 */
export async function isAuthorizedQaRunId(runId: unknown, requestOrigin?: string): Promise<boolean> {
  if (!isQaRunnerEnabled()) return false;
  if (typeof runId !== "string" || !/^[A-Za-z0-9._:-]{1,80}$/.test(runId)) return false;

  const base = (process.env.QA_BASE_URL || "").replace(/\/+$/, "");
  if (!base) return false;
  try {
    const target = new URL(base);
    if (target.protocol !== "https:") return false;
    if (requestOrigin && target.origin !== requestOrigin) return false;
  } catch {
    return false;
  }

  try {
    const rows = await prisma.$queryRaw<Array<{ id: string }>>`
      SELECT id
      FROM qa_test_runs
      WHERE id = ${runId}
        AND target_url = ${base}
        AND target_accounts = 10000
        AND status = 'running'
      LIMIT 1
    `;
    return rows.length === 1;
  } catch {
    return false;
  }
}
