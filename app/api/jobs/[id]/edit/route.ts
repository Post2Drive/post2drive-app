import { withApiMetrics } from "@/lib/apiMetrics";
import { requireJobMarketAccess } from "@/lib/jobMarket";
import { getJobPickupAtForAccount, pickupAccessError } from "@/lib/jobAccess";
import { isSupportedMarket } from "@/lib/market";
import { getAccountAccess } from "@/lib/access";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { validateJobInput } from "@/lib/jobValidation";

async function PATCHHandler(
  req: Request,
  {
    params,
  }: {
    params: Promise<{
      id: string;
    }>;
  }
) {
  const routeParams = await params;
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
  const marketAccessError = await requireJobMarketAccess(accountId, routeParams.id);
  if (marketAccessError) return marketAccessError;

  let body: any;

  try {
    body = await req.json();
  } catch {
    return NextResponse.json(
      {
        error:
          "Invalid request body.",
      },
      { status: 400 }
    );
  }

  const accountMarket = await prisma.account.findUnique({
    where: { id: accountId },
    select: { country: true, currency: true },
  });
  if (!accountMarket || !isSupportedMarket(accountMarket)) {
    return NextResponse.json({ error: "Your account market is not supported." }, { status: 403 });
  }

  const validation =
    validateJobInput(body, accountMarket);

  if (!validation.ok) {
    return NextResponse.json(
      {
        error:
          validation.error,
      },
      { status: 400 }
    );
  }

  const data =
    validation.data;

  const marketplaceAccessCheck =
    await getAccountAccess(accountId);

  if (!marketplaceAccessCheck.allowed) {
    return NextResponse.json(
      {
        error:
          "Marketplace access is unavailable.",
        reason:
          marketplaceAccessCheck.reason,
      },
      {
        status:
          marketplaceAccessCheck.reason ===
          "access_expired"
            ? 402
            : 403,
      }
    );
  }

  let pickupAt: Date;

  try {
    pickupAt = await getJobPickupAtForAccount(
      accountId,
      data.jobDate,
      data.pickupTime,
      data.pickupTimeZone
    );
  } catch {
    return NextResponse.json(
      {
        error:
          "The selected pickup time is invalid for the chosen pickup time zone.",
      },
      { status: 400 }
    );
  }

  const pickupError =
    pickupAccessError(
      marketplaceAccessCheck,
      pickupAt
    );

  if (pickupError) {
    return NextResponse.json(
      pickupError,
      { status: pickupError.status }
    );
  }

  const job =
    await prisma.job.findUnique({
      where: {
        id: routeParams.id,
      },
    });

  if (!job) {
    return NextResponse.json(
      {
        error:
          "Job not found.",
      },
      { status: 404 }
    );
  }

  if (
    job.posterId !==
    accountId
  ) {
    return NextResponse.json(
      {
        error:
          "Only the poster can edit this job.",
      },
      { status: 403 }
    );
  }

  if (
    job.status !==
    "open"
  ) {
    return NextResponse.json(
      {
        error:
          "This job can only be edited while it is open. Once accepted, its core terms are locked.",
      },
      { status: 409 }
    );
  }

  const materialChange =
    job.pickup !==
      data.pickup ||
    job.pickupLat !==
      data.pickupLat ||
    job.pickupLng !==
      data.pickupLng ||
    job.dropoff !==
      data.dropoff ||
    job.dropoffLat !==
      data.dropoffLat ||
    job.dropoffLng !==
      data.dropoffLng ||
    job.jobDate.getTime() !==
      data.jobDate.getTime() ||
    job.pickupTime !==
      data.pickupTime ||
    job.pickupTimeZone !==
      data.pickupTimeZone ||
    job.dropoffTime !==
      data.dropoffTime ||
    job.vehicleType !==
      data.vehicleType ||
    job.weightKg !==
      data.weightKg ||
    job.dimensions !==
      data.dimensions ||
    job.price !==
      data.price ||
    job.pricePerMile !==
      data.pricePerMile ||
    job.priceMode !==
      data.priceMode ||
    job.currency !==
      data.currency ||
    job.crossBorder !==
      data.crossBorder;

  const updated = await prisma.$transaction(async (tx) => {
    // Conditional write closes the check-then-update race: if acceptance
    // wins after the earlier read, this edit must not change the accepted job.
    const transition = await tx.job.updateMany({
      where: {
        id: routeParams.id,
        posterId: accountId,
        status: "open",
      },
      data: {
        pickup: data.pickup,
        pickupLat: data.pickupLat,
        pickupLng: data.pickupLng,
        dropoff: data.dropoff,
        dropoffLat: data.dropoffLat,
        dropoffLng: data.dropoffLng,
        jobDate: data.jobDate,
        pickupTime: data.pickupTime,
        dropoffTime: data.dropoffTime,
        pickupTimeZone: data.pickupTimeZone,
        vehicleType: data.vehicleType,
        weightKg: data.weightKg,
        dimensions: data.dimensions,
        price: data.price,
        pricePerMile: data.pricePerMile,
        notes: data.notes,
        priceMode: data.priceMode,
        currency: data.currency,
        crossBorder: data.crossBorder,
        pickupContactName: data.pickupContactName,
        pickupContactPhone: data.pickupContactPhone,
        dropoffContactName: data.dropoffContactName,
        dropoffContactPhone: data.dropoffContactPhone,
      },
    });

    if (transition.count !== 1) return null;

    const updatedJob = await tx.job.findUniqueOrThrow({
      where: { id: routeParams.id },
    });

    if (materialChange) {
      await tx.bid.updateMany({
        where: { jobId: routeParams.id, status: "active" },
        data: { status: "invalidated" },
      });
    }

    await tx.jobActivity.create({
      data: {
        jobId: routeParams.id,
        actorId: accountId,
        action: "JOB_EDITED",
        fromStatus: "open",
        toStatus: "open",
        description: materialChange
          ? "The poster edited the job's material terms while it was open."
          : "The poster updated job details while it was open.",
        metadata: { materialChange, bidsInvalidated: materialChange },
      },
    });

    return updatedJob;
  });

  if (!updated) {
    return NextResponse.json(
      { error: "This job is no longer open or has already changed. Refresh before editing." },
      { status: 409 }
    );
  }

  return NextResponse.json({
    success: true,
    bidsInvalidated: materialChange,
    job: updated,
  });
}
export const PATCH = withApiMetrics("/api/jobs/[id]/edit", PATCHHandler);
