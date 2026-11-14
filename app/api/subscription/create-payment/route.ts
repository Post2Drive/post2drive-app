import { withApiMetrics } from "@/lib/apiMetrics";
import { enforceRateLimit } from "@/lib/rateLimit";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { CHECKOUT_NOTICE, NO_PROVIDER_NOTICE } from "@/lib/paymentProvider";
import { attachCheckoutToPayment, createPendingSubscriptionPayment } from "@/lib/subscription";
import { createStripeCheckout, getStripeConfig, STRIPE_PROVIDER_ID } from "@/lib/stripeProvider";

const PLAN_NAMES: Record<string, string> = {
  poster: "Post2Drive poster plan (1 month)",
  individual: "Post2Drive driver plan (7 days)",
  fleet: "Post2Drive fleet plan (7 days)",
};

function appBaseUrl(): string | null {
  const raw = (process.env.POST2DRIVE_APP_URL || process.env.NEXTAUTH_URL || "").trim();
  try {
    const url = new URL(raw);
    const local = url.hostname === "localhost" || url.hostname === "127.0.0.1";
    return url.protocol === "https:" || local ? url.origin : null;
  } catch {
    return null;
  }
}

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

    const base = {
      paymentId: payment.id,
      planKey: payment.planKey,
      amountMinorUnits: payment.amountMinorUnits,
      currency: payment.currency,
      status: payment.status,
      // Creating a payment record or a checkout never charges anyone.
      charged: false,
    };
    const stripe = getStripeConfig();
    const baseUrl = appBaseUrl();
    if (!stripe || !baseUrl) {
      return NextResponse.json({ ...base, providerConnected: false, checkoutUrl: null, notice: NO_PROVIDER_NOTICE },
        { headers: { "Cache-Control": "no-store" } });
    }
    if (payment.amountMinorUnits <= 0) {
      return NextResponse.json({ error: "Nothing is payable for this period." }, { status: 409, headers: { "Cache-Control": "no-store" } });
    }

    const checkout = await createStripeCheckout(stripe, {
      paymentId: payment.id,
      accountId,
      planKey: payment.planKey,
      productName: PLAN_NAMES[payment.planKey] ?? "Post2Drive plan",
      amountMinorUnits: payment.amountMinorUnits,
      currency: payment.currency,
      idempotencyKey: `p2d-checkout-${payment.id}`,
      successUrl: `${baseUrl}/settings?payment=processing`,
      cancelUrl: `${baseUrl}/settings?payment=cancelled`,
      customerEmail: session.user.email ?? null,
    });
    if (!checkout.ok || !(await attachCheckoutToPayment(payment.id, STRIPE_PROVIDER_ID, checkout.providerCheckoutId))) {
      return NextResponse.json(
        { error: "Checkout could not be started. Nothing has been charged. Please try again shortly." },
        { status: 502, headers: { "Cache-Control": "no-store" } },
      );
    }
    return NextResponse.json({ ...base, providerConnected: true, checkoutUrl: checkout.redirectUrl, notice: CHECKOUT_NOTICE },
      { headers: { "Cache-Control": "no-store" } });
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
