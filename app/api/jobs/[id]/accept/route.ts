import { withApiMetrics } from "@/lib/apiMetrics";
import { enforceRateLimit } from "@/lib/rateLimit";
import { requireJobMarketAccess } from "@/lib/jobMarket";
import { getJobPickupAtForAccount, pickupAccessError } from "@/lib/jobAccess";
import { getDriveAccess } from "@/lib/access";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { markDriverOpportunityAccepted } from "@/lib/opportunities";
import { recordAcceptedJobUsage } from "@/lib/usage";
import { getLocalisationProfile } from "@/lib/localisation";
import { marketDateKey } from "@/lib/vehicleDates";
import { isIndiaPhoneVerifiedAccount } from "@/lib/eligibility";
import { isQaRunnerEnabled } from "@/lib/qaRunnerGuard";
import { readBoundedText } from "@/lib/requestBody";
import { DRIVER_VEHICLE_ERROR, FLEET_LICENCE_NOT_ACCEPTED, loadFleetStatus, parseDriverDeclaration, resolveJobDriverAssignment } from "@/lib/jobDriverAssignment";

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
  const writeLimit = await enforceRateLimit(req, { scope: "job-accept", identity: accountId, limit: 60, windowMs: 60 * 60 * 1000 });
  if (writeLimit) return writeLimit;

  const marketplaceAccessCheck = await getDriveAccess(accountId);

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
        type: true,
        verificationStatus: true,
        companyVerificationStatus: true,
        isTester: true,
        country: true,
        currency: true,
        phoneVerifiedAt: true,
        planType: true,
        fleetVehicleCount: true,
        qaTestAccounts: { select: { runId: true } },
      },
    });

  const isPilotQaAccount = Boolean(account?.isTester && account.country === "GB" && account.currency === "GBP" && Array.isArray(account.qaTestAccounts) && account.qaTestAccounts.some((entry) => entry.runId === "uk-market-student-qa"));
  const stagingQaTester = Boolean(isQaRunnerEnabled() && isPilotQaAccount);
  if (account && !isIndiaPhoneVerifiedAccount(account) && !stagingQaTester && account.type !== "driver" && account.companyVerificationStatus !== "verified") {
    return NextResponse.json({ error: "Company approval is required for this account before accepting jobs." }, { status: 403 });
  }

  if (!account || (!isIndiaPhoneVerifiedAccount(account) && !stagingQaTester && account.verificationStatus !== "verified" && (!account.isTester || isPilotQaAccount))) {
    return NextResponse.json(
      {
        error:
          "Your account must be verified before accepting jobs.",
      },
      { status: 403 }
    );
  }

  if (account && (!account.isTester || isPilotQaAccount) && !isIndiaPhoneVerifiedAccount(account) && !stagingQaTester) {
    const driverMarket = getLocalisationProfile({ country: account.country, currency: account.currency });
    const marketToday = marketDateKey(new Date(), driverMarket?.timeZone ?? "UTC");
    const dateCutoff = new Date(marketToday + "T00:00:00.000Z");
    const matchingVehicle = await prisma.vehicle.findFirst({
      where: {
        accountId,
        vehicleType: jobForAcceptance.vehicleType,
        verificationStatus: "verified",
        insuranceValidUntil: { gte: dateCutoff },
        ...(driverMarket?.inspectionRequiredAtCountryLevel ? { motValidUntil: { gte: dateCutoff } } : {}),
      },
      select: { id: true },
    });
    if (!matchingVehicle) {
      return NextResponse.json(
        { error: "You need a verified vehicle of the required type with current insurance and any required inspection before accepting it." },
        { status: 403 }
      );
    }
  }

  // Fleet accounts declare the driver, licence and vehicle for this job (§6).
  // Individual drivers may send an empty body; their own record is used.
  const rawBody = req.body ? await readBoundedText(req, 4 * 1024) : { ok: true as const, text: "" };
  if (!rawBody.ok) {
    return NextResponse.json({ error: rawBody.status === 413 ? "Request body is too large." : "Invalid request body." }, { status: rawBody.status });
  }
  let acceptBody: unknown = {};
  if (rawBody.text.trim()) {
    try { acceptBody = JSON.parse(rawBody.text); } catch { return NextResponse.json({ error: "Invalid request body." }, { status: 400 }); }
  }
  // India is intentionally exempt from the per-job driver record: EXECUTION_PLAN §1 keeps
  // India unchanged (phone-only), and a separate India driver model comes later.
  const declaration = isIndiaPhoneVerifiedAccount(account)
    ? { ok: true as const, value: { fleet: false as const } }
    : parseDriverDeclaration(await loadFleetStatus(prisma, { id: accountId, ...account }), acceptBody);
  if (!declaration.ok) {
    return NextResponse.json({ error: declaration.error }, { status: declaration.status });
  }
  const recordsDriverVehicle = (!account.isTester || isPilotQaAccount) && !isIndiaPhoneVerifiedAccount(account) && !stagingQaTester;

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

          const currentDriver = await tx.account.findUnique({
            where: { id: accountId },
            select: { type: true, verificationStatus: true, companyVerificationStatus: true, isTester: true, country: true, currency: true, phoneVerifiedAt: true, qaTestAccounts: { select: { runId: true } } },
          });
          const currentDriverIsPilotQaAccount = Boolean(currentDriver?.isTester && currentDriver.country === "GB" && currentDriver.currency === "GBP" && Array.isArray(currentDriver.qaTestAccounts) && currentDriver.qaTestAccounts.some((entry) => entry.runId === "uk-market-student-qa"));
          const currentDriverStagingQaTester = Boolean(isQaRunnerEnabled() && currentDriverIsPilotQaAccount);
          if (!currentDriver || (!isIndiaPhoneVerifiedAccount(currentDriver) && !currentDriverStagingQaTester && ((currentDriver.type !== "driver" && currentDriver.companyVerificationStatus !== "verified") || (currentDriver.verificationStatus !== "verified" && (!currentDriver.isTester || currentDriverIsPilotQaAccount))))) {
            throw new Error("DRIVER_NOT_VERIFIED");
          }
          if ((!currentDriver.isTester || currentDriverIsPilotQaAccount) && !isIndiaPhoneVerifiedAccount(currentDriver) && !currentDriverStagingQaTester) {
            const driverMarket = getLocalisationProfile({ country: currentDriver.country, currency: currentDriver.currency });
            const marketToday = marketDateKey(new Date(), driverMarket?.timeZone ?? "UTC");
            const dateCutoff = new Date(marketToday + "T00:00:00.000Z");
            const matchingVehicle = await tx.vehicle.findFirst({
              where: {
                accountId,
                vehicleType: job.vehicleType,
                verificationStatus: "verified",
                insuranceValidUntil: { gte: dateCutoff },
                ...(driverMarket?.inspectionRequiredAtCountryLevel ? { motValidUntil: { gte: dateCutoff } } : {}),
              },
              select: { id: true },
            });
            if (!matchingVehicle) throw new Error("DRIVER_VEHICLE_NOT_VERIFIED");
          }

          const driverAssignment = await resolveJobDriverAssignment(tx, {
            accountId,
            declaration: declaration.value,
            vehicleType: job.vehicleType,
            market: { country: currentDriver.country, currency: currentDriver.currency },
            requireEligibleVehicle: recordsDriverVehicle,
          });

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

          if (driverAssignment) {
            // Upsert: a job reopened by unassign/driver back-out may be accepted again.
            await tx.jobDriverAssignment.upsert({
              where: { jobId: id },
              create: { jobId: id, ...driverAssignment },
              update: driverAssignment,
            });
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

    await prisma.driverOpportunity.updateMany({
      where: {
        jobId: id,

        driverId: {
          not: accountId,
        },

        status: {
          in: [
            "exposed",
            "viewed",
            "bid",
          ],
        },
      },

      data: {
        status:
          "unavailable",

        expiredAt:
          new Date(),

        reason:
          "Job was accepted by another driver.",
      },
    });

    await recordAcceptedJobUsage(
      accountId,
      id
    );

    return NextResponse.json({
      success: true,
      job: result,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "";

    if (
      message ===
      "PICKUP_AFTER_ACCESS"
    ) {
      return NextResponse.json(
        {
          error:
            "This job cannot be accepted because its pickup is after your current marketplace access ends.",
          reason: "pickup_after_access",
        },
        { status: 402 }
      );
    }

    if (message === "DRIVER_NOT_VERIFIED") {
      return NextResponse.json({ error: "Your account must be verified before accepting jobs." }, { status: 403 });
    }

    if (message === "DRIVER_LICENCE_NOT_ACCEPTED") {
      return NextResponse.json({ error: FLEET_LICENCE_NOT_ACCEPTED }, { status: 409 });
    }

    if (message === "DRIVER_VEHICLE_NOT_VERIFIED") {
      return NextResponse.json({ error: declaration.value.fleet ? DRIVER_VEHICLE_ERROR : "You need a verified vehicle of the required type with current insurance and any required inspection before accepting it." }, { status: 403 });
    }

    if (
      message ===
      "INVALID_PICKUP_TIME"
    ) {
      return NextResponse.json(
        {
          error:
            "This job has an invalid pickup time.",
        },
        { status: 409 }
      );
    }

    if (
      message ===
      "MARKETPLACE_ACCESS_UNAVAILABLE"
    ) {
      return NextResponse.json(
        {
          error:
            "Marketplace access is unavailable.",
        },
        { status: 402 }
      );
    }

    if (
      message ===
      "JOB_NOT_FOUND"
    ) {
      return NextResponse.json(
        {
          error:
            "Job not found.",
        },
        { status: 404 }
      );
    }

    if (
      message ===
        "JOB_NOT_OPEN" ||
      message ===
        "JOB_ALREADY_TAKEN"
    ) {
      return NextResponse.json(
        {
          error:
            "This job is no longer available.",
        },
        { status: 409 }
      );
    }

    console.error("Accept job failed.", { errorName: error instanceof Error ? error.name : "UnknownError" });

    return NextResponse.json(
      {
        error:
          "Unable to accept job.",
      },
      { status: 500 }
    );
  }
}
export const POST = withApiMetrics("/api/jobs/[id]/accept", POSTHandler);
