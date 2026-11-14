import { NextResponse } from "next/server";
import { withApiMetrics } from "@/lib/apiMetrics";
import { enforceRateLimit } from "@/lib/rateLimit";
import { getStripeConfig, parseStripeWebhook, STRIPE_MAX_WEBHOOK_BYTES, STRIPE_PROVIDER_ID } from "@/lib/stripeProvider";
import { applyVerifiedProviderEvent } from "@/lib/subscription";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const noStore = { "Cache-Control": "no-store" };

/**
 * Stripe webhook. Authentication is the Stripe-Signature HMAC over the exact
 * raw body (5-minute tolerance); there is no session and no shared header
 * secret. Events are applied once via the provider-event ledger.
 *
 * 2xx = received (including events we ignore or cannot apply, so Stripe stops
 * retrying); 400 = not authentic; 5xx = temporary, Stripe will retry.
 */
async function POSTHandler(request: Request) {
  const limited = await enforceRateLimit(request, { scope: "stripe-webhook", limit: 600, windowMs: 60 * 1000 });
  if (limited) return limited;

  const config = getStripeConfig();
  if (!config) return NextResponse.json({ error: "Payment webhook is not configured." }, { status: 503, headers: noStore });

  const declared = Number(request.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > STRIPE_MAX_WEBHOOK_BYTES) {
    return NextResponse.json({ error: "Request body is too large." }, { status: 413, headers: noStore });
  }
  // The signature covers the exact bytes sent, so read the raw text and never re-serialise it.
  const rawBody = await request.text();
  if (Buffer.byteLength(rawBody, "utf8") > STRIPE_MAX_WEBHOOK_BYTES) {
    return NextResponse.json({ error: "Request body is too large." }, { status: 413, headers: noStore });
  }

  const event = parseStripeWebhook(rawBody, request.headers.get("stripe-signature"), config);
  if (!event) return NextResponse.json({ error: "Invalid signature." }, { status: 400, headers: noStore });
  // A test-mode event can never change state on a live-mode deployment, or the reverse.
  if (event.liveMode !== config.liveMode) return NextResponse.json({ received: true, outcome: "ignored" }, { headers: noStore });

  try {
    const outcome = await applyVerifiedProviderEvent(STRIPE_PROVIDER_ID, event);
    return NextResponse.json({ received: true, outcome }, { headers: noStore });
  } catch (error) {
    console.error("Payment webhook could not be processed.", {
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
    return NextResponse.json({ error: "Temporary failure." }, { status: 500, headers: noStore });
  }
}

export const POST = withApiMetrics("/api/subscription/webhook/stripe", POSTHandler);
