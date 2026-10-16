import { withApiMetrics } from "@/lib/apiMetrics";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function round(value: number) {
  return Math.round(value * 100) / 100;
}

export const dynamic = "force-dynamic";

async function GETHandler() {
  try {
    const session = await getServerSession(authOptions);

    if (!session) {
      return NextResponse.json(
        { error: "Not logged in." },
        { status: 401 },
      );
    }

    const accountId = (session.user as any).accountId as
      | string
      | undefined;

    if (!accountId) {
      return NextResponse.json(
        { error: "Account not found." },
        { status: 401 },
      );
    }

    const account = await prisma.account.findUnique({
      where: { id: accountId },
      select: { country: true, currency: true },
    });
    if (!account) return NextResponse.json({ error: "Account not found." }, { status: 404 });

    const [asPoster, asDriver] = await Promise.all([
      prisma.job.findMany({
        where: {
          posterId: accountId,
          status: "completed",
        },
        include: {
          acceptedBy: {
            select: {
              companyName: true,
              displayId: true,
            },
          },
        },
        orderBy: {
          createdAt: "desc",
        },
      }),

      prisma.job.findMany({
        where: {
          acceptedById: accountId,
          status: "completed",
        },
        include: {
          poster: {
            select: {
              companyName: true,
              displayId: true,
            },
          },
        },
        orderBy: {
          createdAt: "desc",
        },
      }),
    ]);

    const posterTotal = asPoster.reduce(
      (sum, job) => sum + job.price,
      0,
    );

    const posterPaid = asPoster
      .filter((job) => Boolean(job.paidMarkedAt))
      .reduce((sum, job) => sum + job.price, 0);

    const posterPending = asPoster
      .filter((job) => !job.paidMarkedAt)
      .reduce((sum, job) => sum + job.price, 0);

    const posterReceiptConfirmed = asPoster
      .filter((job) => Boolean(job.receivedConfirmedAt))
      .reduce((sum, job) => sum + job.price, 0);

    const driverTotal = asDriver.reduce(
      (sum, job) => sum + job.price,
      0,
    );

    const driverPaid = asDriver
      .filter((job) => Boolean(job.paidMarkedAt))
      .reduce((sum, job) => sum + job.price, 0);

    const driverReceived = asDriver
      .filter((job) => Boolean(job.receivedConfirmedAt))
      .reduce((sum, job) => sum + job.price, 0);

    const driverPendingPayment = asDriver
      .filter((job) => !job.paidMarkedAt)
      .reduce((sum, job) => sum + job.price, 0);

    const driverPendingReceipt = asDriver
      .filter(
        (job) =>
          Boolean(job.paidMarkedAt) &&
          !job.receivedConfirmedAt,
      )
      .reduce((sum, job) => sum + job.price, 0);

    const jobsPaid = asPoster.filter(
      (job) => Boolean(job.paidMarkedAt),
    ).length;

    const jobsPaymentPending = asPoster.filter(
      (job) => !job.paidMarkedAt,
    ).length;

    const jobsReceived = asDriver.filter(
      (job) => Boolean(job.receivedConfirmedAt),
    ).length;

    const jobsAwaitingReceipt = asDriver.filter(
      (job) =>
        Boolean(job.paidMarkedAt) &&
        !job.receivedConfirmedAt,
    ).length;

    return NextResponse.json({
      currency: account.currency,
      country: account.country,
      asPoster,
      asDriver,

      posterSummary: {
        jobsDone: asPoster.length,
        totalValue: round(posterTotal),
        markedPaid: round(posterPaid),
        awaitingPayment: round(posterPending),
        receiptConfirmed: round(posterReceiptConfirmed),
        jobsPaid,
        jobsPaymentPending,
      },

      driverSummary: {
        jobsDone: asDriver.length,
        totalReceivable: round(driverTotal),
        markedPaidByPoster: round(driverPaid),
        confirmedReceived: round(driverReceived),
        awaitingPaymentFromPoster: round(driverPendingPayment),
        awaitingReceiptConfirmation: round(
          driverPendingReceipt,
        ),
        jobsReceived,
        jobsAwaitingReceipt,
      },
    });
  } catch (error) {
    console.error("payments GET error:", error);

    return NextResponse.json(
      { error: "Failed to load payment information." },
      { status: 500 },
    );
  }
}
export const GET = withApiMetrics("/api/payments", GETHandler);
