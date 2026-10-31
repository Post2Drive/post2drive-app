import { prisma } from "@/lib/prisma";
import { JobStatus, Prisma } from "@prisma/client";

export async function recordJobActivity({
  jobId,
  actorId,
  action,
  fromStatus,
  toStatus,
  description,
  metadata,
}: {
  jobId: string;
  actorId?: string | null;
  action: string;
  fromStatus?: JobStatus | null;
  toStatus?: JobStatus | null;
  description?: string;
  metadata?: Prisma.InputJsonValue;
}) {
  try {
    return await prisma.jobActivity.create({
      data: {
        jobId,
        actorId: actorId ?? null,
        action,
        fromStatus: fromStatus ?? null,
        toStatus: toStatus ?? null,
        description: description ?? null,
        metadata,
      },
    });
  } catch (error) {
    console.error("Failed to record job activity.", { errorName: error instanceof Error ? error.name : "UnknownError" });

    return null;
  }
}