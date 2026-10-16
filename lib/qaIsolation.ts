import { prisma } from "@/lib/prisma";

/**
 * QA runs intentionally retain synthetic records for diagnosis. Do not expose
 * jobs posted by those accounts to ordinary marketplace users.
 *
 * A mapped QA account keeps fixture visibility so the dedicated QA suite can
 * exercise multi-account job flows. If the QA mapping table cannot be read,
 * this throws rather than silently publishing synthetic jobs.
 */
export async function getSyntheticAccountIdsForUser(
  accountId: string,
): Promise<string[]> {
  const currentAccount = await prisma.$queryRaw<Array<{ isQa: boolean }>>`
    SELECT EXISTS (
      SELECT 1
      FROM qa_test_accounts
      WHERE account_id = ${accountId}
    ) AS "isQa"
  `;

  if (currentAccount[0]?.isQa) {
    return [];
  }

  const mappings = await prisma.$queryRaw<Array<{ account_id: string }>>`
    SELECT DISTINCT account_id
    FROM qa_test_accounts
  `;

  return mappings.map((row) => row.account_id);
}
