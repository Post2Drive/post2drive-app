import { withApiMetrics } from "@/lib/apiMetrics";
import { enforceRateLimit } from "@/lib/rateLimit";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { createPendingSubscriptionPayment } from "@/lib/subscription";

const SAFE_CLIENT_ERRORS = new Set([
  "Paid weekly access is available to supported non-India markets.",
  "Account is pending deletion.",
  "Account must be successfully verified before purchasing access.",
  "This account does not have a valid weekly subscription price.",
  "Account is suspended.",
  "No payment is due yet. Billing starts with your first posted job or first approved vehicle, after any free launch period.",
]);

async function POSTHandler(req: Request) {
  const session = await getServerSession(authOptions);

  if (!session?.user?.accountId) {
    return NextResponse.json(
      { error: "Authentication required." },
      { status: 401 }
    );
  }
  const accountId = session.user.accountId;
  const writeLimit = await enforceRateLimit(req, { scope: "subscription-create-payment", identity: accountId, limit: 10, windowMs: 60 * 60 * 1000 });
  if (writeLimit) return writeLimit;

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
      // Suspension is an authorization denial, not invalid client input.
      const status = ["Account is suspended.", "Account is pending deletion."].includes(error.message) ? 403 : 400;
      return NextResponse.json({ error: error.message }, { status });
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
