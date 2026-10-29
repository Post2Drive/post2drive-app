import { prisma } from "@/lib/prisma";
import { zoneMates } from "@/lib/zones";

/**
 * Determines whether a job can reasonably be considered available
 * to a particular driver.
 *
 * Current prototype matching:
 * - driver has the required vehicle type
 * - same country, OR job is cross-border and countries are compatible
 *
 * Later we can add:
 * - service areas
 * - weight/MAM restrictions
 * - international licence requirements
 * - insurance restrictions
 * - driver availability windows
 * - geographic distance
 */
export async function isJobSuitableForDriver(
  jobId: string,
  driverId: string
) {
  const [job, driver] = await Promise.all([
    prisma.job.findUnique({
      where: { id: jobId },
      include: {
        poster: {
          select: {
            country: true,
          },
        },
      },
    }),

    prisma.account.findUnique({
      where: { id: driverId },
      include: {
        vehicles: {
          select: {
            vehicleType: true,
            verificationStatus: true,
            motValidUntil: true,
            insuranceValidUntil: true,
          },
        },
      },
    }),
  ]);

  if (!job || !driver) {
    return false;
  }

  if (
    driver.type !== "driver" &&
    driver.type !== "both"
  ) {
    return false;
  }

  if (job.posterId === driverId) {
    return false;
  }

  if (driver.type !== "driver" && driver.companyVerificationStatus !== "verified" && !driver.isTester) {
    return false;
  }

  if (driver.verificationStatus !== "verified" && !driver.isTester) {
    return false;
  }

  if (job.status !== "open") {
    return false;
  }

  const now = new Date();

  const hasVehicleType =
    driver.vehicles.some(
      (vehicle) =>
        vehicle.vehicleType === job.vehicleType &&
        (driver.isTester ||
          (vehicle.verificationStatus === "verified" &&
            vehicle.motValidUntil !== null &&
            vehicle.motValidUntil > now &&
            vehicle.insuranceValidUntil !== null &&
            vehicle.insuranceValidUntil > now))
    );

  if (!hasVehicleType) {
    return false;
  }

  if (driver.country === job.poster.country) {
    return true;
  }

  if (!job.crossBorder) {
    return false;
  }

  return zoneMates(driver.country).includes(
    job.poster.country
  );
}

/**
 * Record that a suitable job was exposed to a driver.
 *
 * Upsert means refreshing the jobs page does NOT create
 * hundreds of duplicate opportunities.
 */
export async function recordDriverOpportunity(
  driverId: string,
  jobId: string
) {
  const suitable =
    await isJobSuitableForDriver(
      jobId,
      driverId
    );

  if (!suitable) {
    return null;
  }

  return prisma.driverOpportunity.upsert({
    where: {
      driverId_jobId: {
        driverId,
        jobId,
      },
    },

    create: {
      driverId,
      jobId,
      status: "exposed",
      exposedAt: new Date(),
      lastSeenAt: new Date(),
    },

    update: {
      lastSeenAt: new Date(),
    },
  });
}

/**
 * Mark the opportunity as viewed.
 */
export async function markDriverOpportunityViewed(
  driverId: string,
  jobId: string
) {
  return prisma.driverOpportunity.updateMany({
    where: {
      driverId,
      jobId,
    },

    data: {
      status: "viewed",
      viewedAt: new Date(),
      lastSeenAt: new Date(),
    },
  });
}

/**
 * Mark an opportunity as bid on.
 */
export async function markDriverOpportunityBid(
  driverId: string,
  jobId: string
) {
  return prisma.driverOpportunity.updateMany({
    where: {
      driverId,
      jobId,
    },

    data: {
      status: "bid",
      bidAt: new Date(),
      lastSeenAt: new Date(),
    },
  });
}

/**
 * Mark an opportunity as accepted.
 */
export async function markDriverOpportunityAccepted(
  driverId: string,
  jobId: string
) {
  return prisma.driverOpportunity.updateMany({
    where: {
      driverId,
      jobId,
    },

    data: {
      status: "accepted",
      acceptedAt: new Date(),
      lastSeenAt: new Date(),
    },
  });
}

/**
 * Mark opportunities unavailable when a job is no longer open.
 * Preserve the accepted driver's accepted status.
 */
export async function expireJobOpportunities(
  jobId: string,
  acceptedDriverId?: string | null
) {
  return prisma.driverOpportunity.updateMany({
    where: {
      jobId,
      ...(acceptedDriverId
        ? { driverId: { not: acceptedDriverId } }
        : {}),
      status: {
        in: ["exposed", "viewed", "bid"],
      },
    },
    data: {
      status: "unavailable",
      expiredAt: new Date(),
      reason: "Job is no longer available",
    },
  });
}

/**
 * Restore an opportunity when a job is reopened.
 */
export async function reopenJobOpportunities(jobId: string) {
  const opportunities = await prisma.driverOpportunity.findMany({
    where: {
      jobId,
      status: "unavailable",
    },
    select: {
      driverId: true,
    },
  });

  for (const opportunity of opportunities) {
    await prisma.driverOpportunity.updateMany({
      where: {
        jobId,
        driverId: opportunity.driverId,
        status: "unavailable",
      },
      data: {
        status: "exposed",
        exposedAt: new Date(),
        lastSeenAt: null,
        viewedAt: null,
        bidAt: null,
        acceptedAt: null,
        expiredAt: null,
        reason: null,
      },
    });
  }
}
