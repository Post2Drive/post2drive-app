import { getReminderSnapshot } from "@/lib/access";
import { notify } from "@/lib/notify";
import { isJobSuitableForDriver } from "@/lib/opportunities";

export const JOB_MATCH_NOTIFICATION_CAP = 200;
const CANDIDATE_SCAN_LIMIT = 600;

type MatchDb = {
  account: { findMany(args: any): Promise<Array<{ id: string }>> };
  notification: { createMany(args: any): Promise<{ count: number }> };
};

/**
 * Notify eligible drivers in the poster's market that a matching job was posted.
 * Eligible = person-verified, not deleted/suspended, same market, an approved
 * vehicle of the job's type (isJobSuitableForDriver also re-checks insurance and
 * inspection validity), and active drive access (not waitlisted). The poster
 * is excluded. Runs after the job commit; callers must catch errors.
 */
export async function notifyMatchingDrivers(
  db: MatchDb,
  job: { id: string; posterId: string; vehicleType: string },
  poster: { country: string; currency: string },
  cap = JOB_MATCH_NOTIFICATION_CAP,
): Promise<number> {
  const candidates = await db.account.findMany({
    where: {
      id: { not: job.posterId },
      type: { in: ["driver", "both"] },
      country: poster.country,
      currency: poster.currency,
      verificationStatus: "verified",
      deletionRequestedAt: null,
      vehicles: { some: { vehicleType: job.vehicleType, verificationStatus: "verified", verifiedAt: { not: null } } },
    },
    select: { id: true },
    orderBy: { id: "asc" },
    take: CANDIDATE_SCAN_LIMIT,
  });

  let sent = 0;
  for (const candidate of candidates) {
    if (sent >= cap) break;
    try {
      if (!(await isJobSuitableForDriver(job.id, candidate.id))) continue;
      // Read-only check: posting a job must never join, reorder or admit anyone on the driver waitlist.
      const snapshot = await getReminderSnapshot(candidate.id, new Date());
      if (!snapshot?.drive.allowed) continue;
      const created = await notify(db, {
        accountId: candidate.id,
        type: "job_match",
        title: "New job matches your vehicle",
        body: `A new ${job.vehicleType.replaceAll("_", " ")} job was posted in your market. Open the job list to review it and place a bid.`,
        jobId: job.id,
        eventKey: `job-match:${job.id}:${candidate.id}`,
      });
      if (created) sent += 1;
    } catch (error) {
      console.error("Job match notification failed for one driver.", { errorName: error instanceof Error ? error.name : "UnknownError" });
    }
  }
  return sent;
}
