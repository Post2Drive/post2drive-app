import { withApiMetrics } from "@/lib/apiMetrics";
import { getJobPickupAt, pickupAccessError } from "@/lib/jobAccess";
import { getAccountAccess } from "@/lib/access";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { recordDriverOpportunity } from "@/lib/opportunities";
import { validateJobInput } from "@/lib/jobValidation";
import { buildJobFilters } from "@/lib/jobSearch";
import { isQaAccount } from "@/lib/qaIsolation";
import { isSupportedMarket, marketForAccount } from "@/lib/market";
import { getTimeZoneOptions } from "@/lib/localisation";
import { enforceRateLimit } from "@/lib/rateLimit";

function hasFuturePickup(
  job: { jobDate: Date; pickupTime: string | null; pickupTimeZone: string | null },
  market: { country: string; currency: string },
): boolean {
  try {
    return getJobPickupAt(job.jobDate, job.pickupTime, market, job.pickupTimeZone).getTime() > Date.now();
  } catch {
    return false;
  }
}

async function GETHandler(req: Request) {
  const session = await getServerSession(authOptions);

  if (!session) {
    return NextResponse.json(
      { error: "Not logged in." },
      { status: 401 },
    );
  }

  const accountId = (session.user as any).accountId;
    if (!accountId) {
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 }
    );
  }

  const marketplaceAccessCheck = await getAccountAccess(accountId);

  /*
   * Expired accounts may still see their own posted jobs and
   * jobs they have already accepted. They simply lose access
   * to new open marketplace activity.
   */
  const actor = await prisma.account.findUnique({
    where: { id: accountId },
    select: { country: true, currency: true, verificationStatus: true, companyVerificationStatus: true },
  });
  if (!actor || !isSupportedMarket(actor)) {
    return NextResponse.json({ error: "Your account market is not supported." }, { status: 403 });
  }
  const country = actor.country;
  const currency = actor.currency;
  // Unified accounts can post and carry work; open marketplace discovery is
  // available only after business and vehicle compliance checks. Existing job
  // parties can still see their own job history when these checks lapse.
  const hasMarketplaceVehicle = (await prisma.vehicle.findFirst({
    where: {
      accountId,
      verificationStatus: "verified",
      insuranceValidUntil: { gte: new Date(new Date().toISOString().slice(0, 10) + "T00:00:00.000Z") },
    },
    select: { id: true },
  })) !== null;
  const canBrowseOpenMarketplace = marketplaceAccessCheck.allowed &&
    (actor.verificationStatus === "verified" &&
      actor.companyVerificationStatus === "verified" && hasMarketplaceVehicle);

  const url = new URL(req.url);

  const search =
    url.searchParams.get("search")?.trim() || "";

  const vehicleType =
    url.searchParams.get("vehicleType")?.trim() || "";

  const minPriceRaw =
    url.searchParams.get("minPrice");

  const maxPriceRaw =
    url.searchParams.get("maxPrice");

  const minPrice =
    minPriceRaw !== null &&
    minPriceRaw !== ""
      ? Number(minPriceRaw)
      : undefined;

  const maxPrice =
    maxPriceRaw !== null &&
    maxPriceRaw !== ""
      ? Number(maxPriceRaw)
      : undefined;

  if (
    minPrice !== undefined &&
    (!Number.isFinite(minPrice) || minPrice < 0)
  ) {
    return NextResponse.json(
      { error: "Invalid minimum price." },
      { status: 400 },
    );
  }

  if (
    maxPrice !== undefined &&
    (!Number.isFinite(maxPrice) || maxPrice < 0)
  ) {
    return NextResponse.json(
      { error: "Invalid maximum price." },
      { status: 400 },
    );
  }

  if (
    minPrice !== undefined &&
    maxPrice !== undefined &&
    minPrice > maxPrice
  ) {
    return NextResponse.json(
      {
        error:
          "Minimum price cannot be greater than maximum price.",
      },
      { status: 400 },
    );
  }

  const vehicleTypeFilter: Record<string, never> = {};

  const searchFilter = buildJobFilters({
    search,
    vehicleType,
    minPrice,
    maxPrice,
  });

  const localOpenWhere: any = {
    ...searchFilter,
    currency,
    crossBorder: false,
    poster: {
      country,
      currency,
    },
    ...vehicleTypeFilter,
  };

  // Keep retained QA fixtures out of the real marketplace. QA accounts can
  // still see fixtures while running the synthetic suite.
  const requesterIsQaAccount = await isQaAccount(accountId);
  const posterFilter = {
    country,
    currency,
    // Keep the exclusion inside PostgreSQL instead of sending every retained
    // synthetic account ID as a separate Prisma query parameter.
    ...(!requesterIsQaAccount ? { qaTestAccounts: { none: {} } } : {}),
  };

  const jobs = await prisma.job.findMany({
    where: {
      currency,
      crossBorder: false,
      poster: posterFilter,
      AND: [
        {
          OR: [
            ...(canBrowseOpenMarketplace
              ? [
                  localOpenWhere,
                ]
              : []),

            { posterId: accountId },
            { acceptedById: accountId },
            {
              activities: {
                some: {
                  action: "DRIVER_BACKED_OUT",
                  actorId: accountId,
                },
              },
            },
          ],
        },
      ],
    },

    include: {
      poster: {
        select: {
          companyName: true,
          displayId: true,
          createdAt: true,
          users: {
            select: {
              name: true,
              phone: true,
              email: true,
            },
            take: 1,
          },
        },
      },

      acceptedBy: {
        select: {
          companyName: true,
          displayId: true,
          createdAt: true,
          users: {
            select: {
              name: true,
              phone: true,
              email: true,
            },
            take: 1,
          },
        },
      },
      activities: {
        where: { action: "DRIVER_BACKED_OUT" },
        select: { actorId: true, createdAt: true },
        orderBy: { createdAt: "desc" },
      },
    },

    orderBy: [
      {
        jobDate: "asc",
      },
      {
        createdAt: "desc",
      },
    ],
  });

  /*
   * Record suitable open marketplace jobs exposed to this account.
   * Tracking errors must not prevent the jobs list from loading.
   */
  if (canBrowseOpenMarketplace) {
    const marketplaceJobs = jobs.filter(
      (job) =>
        job.status === "open" &&
        job.posterId !== accountId &&
        hasFuturePickup(job, actor)
    );

    const trackingResults = await Promise.allSettled(
      marketplaceJobs.map((job) =>
        recordDriverOpportunity(accountId, job.id)
      )
    );

    const trackingFailures = trackingResults.filter(
      (result) => result.status === "rejected"
    );

    if (trackingFailures.length > 0) {
      console.error(
        "Some driver opportunities could not be recorded:",
        trackingFailures.length
      );
    }
  }

  const contactVisibleStatuses = [
    "accepted",
    "in_transit",
    "delivered",
    "completed",
  ];

  const filtered = jobs.map((job) => {
    const {
      activities,
      pickupContactName,
      pickupContactPhone,
      dropoffContactName,
      dropoffContactPhone,
      ...jobData
    } = job;
    const previousDriverIds = [...new Set(
      activities
        .map((activity) => activity.actorId)
        .filter((id): id is string => Boolean(id))
    )];
    const jobWithMatchHistory = { ...jobData, previousDriverIds };

    // Contact details are private to the current job parties. A driver
    // who previously backed out may retain job visibility/history, but must
    // not inherit the current driver's or poster's private contact details.
    if (
      !contactVisibleStatuses.includes(job.status) ||
      (job.posterId !== accountId && job.acceptedById !== accountId)
    ) {
      return {
        ...jobWithMatchHistory,
        // Site-contact names and phone numbers are not marketplace discovery
        // fields; disclose them only once the requester is a current party to
        // an accepted/in-progress/completed job.
        pickupContactName: null,
        pickupContactPhone: null,
        dropoffContactName: null,
        dropoffContactPhone: null,

        poster: {
          companyName:
            job.poster.companyName,
          displayId:
            job.poster.displayId,
          createdAt:
            job.poster.createdAt,
        },

        acceptedBy:
          job.acceptedBy
            ? {
                companyName:
                  job.acceptedBy.companyName,
                displayId:
                  job.acceptedBy.displayId,
                createdAt:
                  job.acceptedBy.createdAt,
              }
            : null,
      };
    }

    return {
      ...jobWithMatchHistory,
      pickupContactName,
      pickupContactPhone,
      dropoffContactName,
      dropoffContactPhone,
    };
  }).filter((job) => {
    const previousDriverIds = Array.isArray(job.previousDriverIds) ? job.previousDriverIds : [];
    const keepForHistory = job.posterId === accountId ||
      job.acceptedById === accountId ||
      previousDriverIds.includes(accountId);
    if (job.status !== "open" || keepForHistory) return true;
    return hasFuturePickup(job, actor);
  });

  return NextResponse.json({
    jobs: filtered,
    filters: {
      search,
      vehicleType,
      minPrice:
        minPrice ?? null,
      maxPrice:
        maxPrice ?? null,
    },
  });
}

async function POSTHandler(req: Request) {
  const session =
    await getServerSession(authOptions);

  if (!session) {
    return NextResponse.json(
      { error: "Not logged in." },
      { status: 401 },
    );
  }


  let body: any;

  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      {
        error:
          "Invalid request body.",
      },
      { status: 400 },
    );
  }

  const accountId = (session.user as any).accountId as string | undefined;
  if (!accountId) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }
  const writeLimit = await enforceRateLimit(req, { scope: "job-create", identity: accountId, limit: 30, windowMs: 60 * 60 * 1000 });
  if (writeLimit) return writeLimit;

  const account = await prisma.account.findUnique({
    where: { id: accountId },
    select: { country: true, currency: true, verificationStatus: true, companyVerificationStatus: true },
  });
  if (!account || !isSupportedMarket(account)) {
    return NextResponse.json({ error: "Your account market is not supported." }, { status: 403 });
  }
  if (account.verificationStatus !== "verified") {
    return NextResponse.json({ error: "Verify your account before posting jobs." }, { status: 403 });
  }
  if (account.companyVerificationStatus !== "verified") {
    return NextResponse.json({ error: "Company verification is required before posting jobs. Submit your business details for review." }, { status: 403 });
  }

  const validation = validateJobInput(body, account);
  if (!validation.ok) {
    return NextResponse.json({ error: validation.error }, { status: 400 });
  }

  const marketplaceAccessCheck = await getAccountAccess(accountId);
  let pickupAt: Date;
  try {
    pickupAt = getJobPickupAt(validation.data.jobDate, validation.data.pickupTime, account, validation.data.pickupTimeZone);
  } catch (error) {
    const code = error instanceof Error ? error.message : "";
    const market = marketForAccount(account);
    const timeZoneName = getTimeZoneOptions(account.country, market?.timeZone).find((zone) => zone.value === validation.data.pickupTimeZone)?.label ?? validation.data.pickupTimeZone;
    return NextResponse.json({
      error: code === "AMBIGUOUS_PICKUP_TIME_DST"
        ? "The selected pickup time is ambiguous because of the daylight-saving clock change. Please choose another time."
        : code === "INVALID_PICKUP_TIME_DST"
          ? "The selected pickup time does not exist because of the daylight-saving clock change. Please choose another time."
          : `Invalid pickup time for ${timeZoneName}.`,
    }, { status: 400 });
  }

  const pickupError = pickupAccessError(marketplaceAccessCheck, pickupAt);
  if (pickupError) {
    return NextResponse.json(pickupError, { status: pickupError.status });
  }

try {
    // Keep the initial state and its audit event atomic. Admin analytics and
    // job history must not silently miss successfully posted jobs.
    const job = await prisma.$transaction(async (tx) => {
      const createdJob = await tx.job.create({
        data: {
          ...validation.data,
          crossBorder: false,
          posterId: accountId,
          status: "open",
        },
      });

      await tx.jobActivity.create({
        data: {
          jobId: createdJob.id,
          actorId: accountId,
          action: "JOB_POSTED",
          fromStatus: null,
          toStatus: "open",
          description: "Job posted to the marketplace.",
        },
      });

      return createdJob;
    });

    return NextResponse.json(
      {
        success: true,
        job,
      },
      { status: 201 },
    );
  } catch (error) {
    console.error(
      "create job error:",
      error,
    );

    return NextResponse.json(
      {
        error:
          "Failed to create job.",
      },
      { status: 500 },
    );
  }
}
export const GET = withApiMetrics("/api/jobs", GETHandler);
export const POST = withApiMetrics("/api/jobs", POSTHandler);
