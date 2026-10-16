import { withApiMetrics } from "@/lib/apiMetrics";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { createPendingSubscriptionPayment } from "@/lib/subscription";

async function POSTHandler() {
  const session = await getServerSession(authOptions);

  if (!session?.user?.accountId) {
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 }
    );
  }

  try {
    const payment = await createPendingSubscriptionPayment(
      session.user.accountId
    );

    return NextResponse.json({
      paymentId: payment.id,
      planKey: payment.planKey,
      amountMinorUnits: payment.amountPence,
      amountMinorUnits: payment.amountMinorUnits,
      currency: payment.currency,
      status: payment.status,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unable to create subscription payment.";

    return NextResponse.json(
      { error: message },
      { status: 400 }
    );
  }
}

export const POST = withApiMetrics("/api/subscription/create-payment", POSTHandler);
