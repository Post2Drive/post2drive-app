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
      return NextResponse.json({ error: "Not logged in." }, { status: 401 });
    }

    const accountId = (session.user as any).accountId as string | undefined;
    if (!accountId) {
      return NextResponse.json({ error: "Account not found." }, { status: 401 });
    }

    const account = await prisma.account.findUnique({
      where: { id: accountId },
      select: { country: true, currency: true },
    });
    if (!account) {
      return NextResponse.json({ error: "Account not found." }, { status: 404 });
    }
    if (!account.country || !account.currency) {
      return NextResponse.json({ error: "Account market is unavailable." }, { status: 403 });
    }

    // Payment tracking is a marketplace view, not a payment-provider ledger.
    // Scope both roles to the caller's market and return only fields rendered by
    // the payments page; never serialize complete Job or Account records here.
    const marketJobWhere = {
      status: "completed" as const,
      currency: account.currency,
      crossBorder: false,
      poster: {
        is: {
          country: account.country,
          currency: account.currency,
        },
      },
    };

    const paymentJobSelect = {
      id: true,
      pickup: true,
      dropoff: true,
      price: true,
      currency: true,
      createdAt: true,
      paidMarkedAt: true,
      receivedConfirmedAt: true,
    } as const;

    // Lists are capped (PAYMENT_LIST_CAP + 1 fetched to detect truncation), but
    // every summary total is computed by the database over the same uncapped
    // where-clause, so accounts with more than PAYMENT_LIST_CAP completed jobs
    // still see correct totals.
    const PAYMENT_LIST_CAP = 500;
    const listOrder = [{ createdAt: "desc" as const }, { id: "desc" as const }];
    const posterWhere = { ...marketJobWhere, posterId: accountId };
    const driverWhere = { ...marketJobWhere, acceptedById: accountId };
    const paid = { paidMarkedAt: { not: null } };
    const unpaid = { paidMarkedAt: null };
    const received = { receivedConfirmedAt: { not: null } };
    const sumPrice = { _sum: { price: true }, _count: { _all: true } } as const;

    const [
      posterRows,
      driverRows,
      posterAll,
      posterPaidAgg,
      posterPendingAgg,
      posterReceiptAgg,
      driverAll,
      driverPaidAgg,
      driverReceivedAgg,
      driverPendingPaymentAgg,
      driverPendingReceiptAgg,
    ] = await Promise.all([
      prisma.job.findMany({
        where: posterWhere,
        select: {
          ...paymentJobSelect,
          acceptedBy: {
            select: { companyName: true, displayId: true },
          },
        },
        take: PAYMENT_LIST_CAP + 1,
        orderBy: listOrder,
      }),
      prisma.job.findMany({
        where: driverWhere,
        select: {
          ...paymentJobSelect,
          poster: {
            select: { companyName: true, displayId: true },
          },
        },
        take: PAYMENT_LIST_CAP + 1,
        orderBy: listOrder,
      }),
      prisma.job.aggregate({ where: posterWhere, ...sumPrice }),
      prisma.job.aggregate({ where: { ...posterWhere, ...paid }, ...sumPrice }),
      prisma.job.aggregate({ where: { ...posterWhere, ...unpaid }, ...sumPrice }),
      prisma.job.aggregate({ where: { ...posterWhere, ...received }, ...sumPrice }),
      prisma.job.aggregate({ where: driverWhere, ...sumPrice }),
      prisma.job.aggregate({ where: { ...driverWhere, ...paid }, ...sumPrice }),
      prisma.job.aggregate({ where: { ...driverWhere, ...received }, ...sumPrice }),
      prisma.job.aggregate({ where: { ...driverWhere, ...unpaid }, ...sumPrice }),
      prisma.job.aggregate({
        where: { ...driverWhere, ...paid, receivedConfirmedAt: null },
        ...sumPrice,
      }),
    ]);

    const posterHasMore = posterRows.length > PAYMENT_LIST_CAP;
    const driverHasMore = driverRows.length > PAYMENT_LIST_CAP;
    const asPoster = posterHasMore ? posterRows.slice(0, PAYMENT_LIST_CAP) : posterRows;
    const asDriver = driverHasMore ? driverRows.slice(0, PAYMENT_LIST_CAP) : driverRows;

    const total = (agg: { _sum: { price: number | null } }) => agg._sum.price ?? 0;

    return NextResponse.json({
      currency: account.currency,
      country: account.country,
      asPoster,
      asDriver,
      asPosterHasMore: posterHasMore,
      asDriverHasMore: driverHasMore,
      listCap: PAYMENT_LIST_CAP,
      posterSummary: {
        jobsDone: posterAll._count._all,
        totalValue: round(total(posterAll)),
        markedPaid: round(total(posterPaidAgg)),
        awaitingPayment: round(total(posterPendingAgg)),
        receiptConfirmed: round(total(posterReceiptAgg)),
        jobsPaid: posterPaidAgg._count._all,
        jobsPaymentPending: posterPendingAgg._count._all,
      },
      driverSummary: {
        jobsDone: driverAll._count._all,
        totalReceivable: round(total(driverAll)),
        markedPaidByPoster: round(total(driverPaidAgg)),
        confirmedReceived: round(total(driverReceivedAgg)),
        awaitingPaymentFromPoster: round(total(driverPendingPaymentAgg)),
        awaitingReceiptConfirmation: round(total(driverPendingReceiptAgg)),
        jobsReceived: driverReceivedAgg._count._all,
        jobsAwaitingReceipt: driverPendingReceiptAgg._count._all,
      },
    }, {
      headers: { "Cache-Control": "private, no-store" },
    });
  } catch (error) {
    console.error("payments GET error:", error instanceof Error ? error.name : "UnknownError");
    return NextResponse.json(
      { error: "Failed to load payment information." },
      { status: 500, headers: { "Cache-Control": "private, no-store" } },
    );
  }
}

export const GET = withApiMetrics("/api/payments", GETHandler);
