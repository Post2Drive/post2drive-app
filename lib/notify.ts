import { getPushProvider } from "@/lib/pushProvider";

type NotifyDb = {
  notification: {
    // Prisma's generated createMany arg type is model-specific (Json fields); keep this structural.
    createMany(args: any): Promise<{ count: number }>;
  };
};

export type NotifyInput = {
  accountId: string;
  type: string;
  title: string;
  body: string;
  jobId?: string | null;
  /** Unique per logical event; a repeat with the same key is silently skipped. */
  eventKey: string;
  metadata?: Record<string, unknown>;
};

/**
 * Create an in-app notification idempotently, then offer it to the optional
 * push provider. Accepts a Prisma client or a transaction client.
 *
 * Duplicates are skipped with INSERT ... ON CONFLICT DO NOTHING (skipDuplicates),
 * so a repeated eventKey neither throws nor aborts an enclosing Postgres
 * transaction. Push delivery is best-effort and never throws.
 * Returns true when a new notification was created.
 */
export async function notify(db: NotifyDb, input: NotifyInput): Promise<boolean> {
  const result = await db.notification.createMany({
    data: [{
      accountId: input.accountId,
      type: input.type,
      title: input.title,
      body: input.body,
      jobId: input.jobId ?? null,
      eventKey: input.eventKey,
      ...(input.metadata ? { metadata: input.metadata } : {}),
    }],
    skipDuplicates: true,
  });
  if (result.count !== 1) return false;

  try {
    const provider = getPushProvider();
    if (provider) {
      await provider.send({ accountId: input.accountId, title: input.title, body: input.body, jobId: input.jobId ?? null, type: input.type });
    }
  } catch (error) {
    console.error("Push notification failed.", { errorName: error instanceof Error ? error.name : "UnknownError" });
  }
  return true;
}
