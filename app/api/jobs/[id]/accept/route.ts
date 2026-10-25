import { withApiMetrics } from "@/lib/apiMetrics";
import { requireJobMarketAccess } from "@/lib/jobMarket";
import { getJobPickupAtForAccount, pickupAccessError } from "@/lib/jobAccess";
import { getAccountAccess } from "@/lib/access";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { markDriverOpportunityAccepted } from "@/lib/opportunities";
import { recordAcceptedJobUsage } from "@/lib/usage";
import { hasEligibleVehicleForJob } from "@/lib/eligibility";

async function POSTHandler(
  req: Request,
  {
    params,
  }: {
    params: Promise<{
      id: string;
    }>;
  }
) {
  const { id } = await params;

  const session =
    await getServerSession(
      authOptions
    );

  if (!session) {
    return NextResponse.json(
      {
        error:
          "Not logged in.",
      },
      { status: 401 }
    );
  }

  const accountId =
    (session.user as any)
      .accountId;
  if (!accountId) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }
  const marketAccessError = await requireJobMarketAccess(accountId, id);
  if (marketAccessError) return marketAccessError;

  const marketplaceAccessCheck = await getAccountAccess(accountId);

  if (!marketplaceAccessCheck.allowed) {
    return NextResponse.json(
      {
        error: "Marketplace access is unavailable.",
        reason: marketplaceAccessCheck.reason,
      },
      {
        status:
          marketplaceAccessCheck.reason === "access_expired"
            ? 402
            : 403,
      }
    );
  }

  const jobForAcceptance = await prisma.job.findUnique({
    where: { id: id },
    select: { posterId: true, priceMode: true, vehicleType: true },
  });

  if (!jobForAcceptance) {
    return NextResponse.json(
      { error: "Job not found." },
      { status: 404 }
    );
  }

  if (jobForAcceptance.posterId === accountId) {
    return NextResponse.json(
      { error: "You cannot accept your own job as a driver." },
      { status: 403 }
    );
  }

  if (jobForAcceptance.priceMode === "bid") {
    return NextResponse.json(
      { error: "This job uses bidding. Submit a bid and wait for the poster to select it." },
      { status: 409 }
    );
  }

  const account =
    await prisma.account.findUnique({
      where: {
        id: accountId,
      },
      select: {
        verificationStatus: true,
        companyVerificationStatus: true,
        country: true,
        currency: true,
      },
    });

  if (account?.verificationStatus !== "verified") {
    return NextResponse.json(
      {
        error:
          "Your account must be verified before accepting jobs.",
      },
      { status: 403 }
    );
  }

  if (!account || !(await hasEligibleVehicleForJob(accountId, account, jobForAcceptance.vehicleType))) {
    return NextResponse.json(
      { error: "You need a verified vehicle of the required type with current insurance and any required inspection before accepting it." },
      { status: 403 }
    );
  }

  try {
    const result =
      await prisma.$transaction(
        async (tx) => {
          const job =
            await tx.job.findUnique({
              where: {
                id: id,
              },
            });

          if (!job) {
            throw new Error(
              "JOB_NOT_FOUND"
            );
          }

          if (job.posterId === accountId) {
            throw new Error(
              "OWN_JOB"
            );
          }

          let pickupAt: Date;

          try {
            pickupAt = await getJobPickupAtForAccount(
              accountId,
              job.jobDate,
              job.pickupTime,
              job.pickupTimeZone
            );
          } catch {
            throw new Error(
              "INVALID_PICKUP_TIME"
            );
          }

          const pickupError =
            pickupAccessError(
              marketplaceAccessCheck,
              pickupAt
            );

          if (pickupError) {
            throw new Error(
              pickupError.reason === "pickup_after_access"
                ? "PICKUP_AFTER_ACCESS"
                : "MARKETPLACE_ACCESS_UNAVAILABLE"
            );
          }

          if (
            job.status !==
            "open"
          ) {
            throw new Error(
              "JOB_NOT_OPEN"
            );
          }

          const updated =
            await tx.job.updateMany({
              where: {
                id: id,
                status: "open",
                priceMode: "fixed",
              },

              data: {
                status:
                  "accepted",

                acceptedById:
                  accountId,
              },
            });

          if (
            updated.count !== 1
          ) {
            throw new Error(
              "JOB_ALREADY_TAKEN"
            );
          }

          await tx.jobActivity.create({
            data: {
              jobId: id,
              actorId: accountId,
              action: "JOB_ACCEPTED",
              fromStatus: "open",
              toStatus: "accepted",
              description: "A driver accepted the job.",
            },
          });

          await tx.notification.create({
            data: {
              accountId: job.posterId,
              type: "job_accepted",
              title: "Your job was accepted",
              body: `A driver accepted job ${id}. Open the job list to review the assignment.`,
              jobId: id,
              eventKey: `job-accepted:${id}:${accountId}`,
              metadata: { driverAccountId: accountId },
            },
          });

          return tx.job.findUnique({
            where: {
              id: id,
            },
          });
        }
      );

    await markDriverOpportunityAccepted(
      accountId,
      id
    );
    await recordAcceptedJobUsage(accountId, id);
    return NextResponse.json({ success: true, job: result });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message === "JOB_NOT_FOUND") return NextResponse.json({ error: "Job not found." }, { status: 404 });
    if (message === "OWN_JOB") return NextResponse.json({ error: "You cannot accept your own job." }, { status: 403 });
    if (message === "INVALID_PICKUP_TIME") return NextResponse.json({ error: "This job has an invalid pickup time." }, { status: 409 });
    if (message === "PICKUP_AFTER_ACCESS") return NextResponse.json({ error: "The pickup is after your current marketplace access ends." }, { status: 403 });
    if (message === "MARKETPLACE_ACCESS_UNAVAILABLE") return NextResponse.json({ error: "Marketplace access is unavailable." }, { status: 402 });
    if (message === "JOB_NOT_OPEN" || message === "JOB_ALREADY_TAKEN") return NextResponse.json({ error: "This job is no longer open." }, { status: 409 });
    console.error("Accept job error:", error);
    return NextResponse.json({ error: "Unable to accept this job right now." }, { status: 500 });
  }
}
export const POST = withApiMetrics("/api/jobs/[id]/accept", POSTHandler);
