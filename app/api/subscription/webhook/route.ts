import { withApiMetrics } from "@/lib/apiMetrics";
import { NextResponse } from "next/server";
import { confirmSubscriptionPayment } from "@/lib/subscription";

async function POSTHandler(request: Request) {
  const expectedSecret = process.env.SUBSCRIPTION_WEBHOOK_SECRET;
  const providedSecret = request.headers.get("x-post2drive-webhook-secret");

  if (
    !expectedSecret ||
    !providedSecret ||
    providedSecret !== expectedSecret
  ) {
    return NextResponse.json(
      { error: "Unauthorized." },
      { status: 401 }
    );
  }

  try {
    const body = await request.json();

    if (!body?.paymentId || typeof body.paymentId !== "string") {
      return NextResponse.json(
        { error: "paymentId is required." },
        { status: 400 }
      );
    }

    const payment = await confirmSubscriptionPayment(body.paymentId, {
      provider:
        typeof body.provider === "string"
          ? body.provider
          : undefined,
      providerPaymentId:
        typeof body.providerPaymentId === "string"
          ? body.providerPaymentId
          : undefined,
      providerCheckoutId:
        typeof body.providerCheckoutId === "string"
          ? body.providerCheckoutId
          : undefined,
    });

    return NextResponse.json({
      success: true,
      paymentId: payment.id,
      status: payment.status,
      accessStartedAt: payment.accessStartedAt,
      accessEndsAt: payment.accessEndsAt,
    });
  } catch (error) {
    const message =
      error instanceof Error
        ? error.message
        : "Unable to confirm subscription payment.";

    return NextResponse.json(
      { error: message },
      { status: 400 }
    );
  }
}

export const POST = withApiMetrics("/api/subscription/webhook", POSTHandler);
