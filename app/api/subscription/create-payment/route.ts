import { withApiMetrics } from "@/lib/apiMetrics";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { createPendingSubscriptionPayment } from "@/lib/subscription";

const SAFE_CLIENT_ERRORS = new Set([
  "Paid weekly access is available to supported non-India markets.",
  "Account must be successfully verified before purchasing access.",
  "This account does not have a valid weekly subscription price.",
]);

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
      amountMinorUnits: payment.amountMinorUnits,
      currency: payment.currency,
      status: payment.status,
    });
  } catch (error) {
    // Only known business-rule errors are safe to show to the caller.
    // Database/ORM failures must not leak schema, query, or infrastructure details.
    if (error instanceof Error && SAFE_CLIENT_ERRORS.has(error.message)) {
      return NextResponse.json({ error: error.message }, { status: 400 });
    }

    console.error("Unable to create subscription payment.", {
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
    return NextResponse.json(
      { error: "Unable to create subscription payment. Please try again later." },
      { status: 500, headers: { "Cache-Control": "no-store" } }
    );
  }
}

export const POST = withApiMetrics("/api/subscription/create-payment", POSTHandler);
