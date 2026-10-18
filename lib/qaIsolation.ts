import { prisma } from "@/lib/prisma";

/**
 * QA runs intentionally retain synthetic records for diagnosis. Ordinary
 * marketplace requests must exclude jobs posted by those accounts, while a
 * mapped QA account must retain fixture visibility for multi-account tests.
 *
 * Return only the requester's QA status. Never materialise the entire account
 * pool into a Prisma notIn list: the retained pool can exceed the provider's
 * query-parameter limit.
 */
export async function isQaAccount(accountId: string): Promise<boolean> {
  const rows = await prisma.$queryRaw<Array<{ isQa: boolean }>>`
    SELECT EXISTS (
      SELECT 1
      FROM qa_test_accounts
      WHERE account_id = ${accountId}
    ) AS "isQa"
  `;
  return rows[0]?.isQa === true;
}
