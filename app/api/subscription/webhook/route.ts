import { withApiMetrics } from "@/lib/apiMetrics";
import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { readBoundedJson } from "@/lib/requestBody";
import { confirmSubscriptionPayment } from "@/lib/subscription";

function constantTimeSecretEqual(expected: string, supplied: string) {
  const expectedBytes = Buffer.from(expected, "utf8");
  const suppliedBytes = Buffer.from(supplied, "utf8");
  return expectedBytes.length > 0 &&
    expectedBytes.length === suppliedBytes.length &&
    timingSafeEqual(expectedBytes, suppliedBytes);
}

async function POSTHandler(request: Request) {
  const expectedSecret = process.env.SUBSCRIPTION_WEBHOOK_SECRET;
  const providedSecret = request.headers.get("x-post2drive-webhook-secret");

  if (!expectedSecret || !providedSecret || !constantTimeSecretEqual(expectedSecret, providedSecret)) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  const parsedBody = await readBoundedJson(request, 16 * 1024);
  if (!parsedBody.ok) {
    return NextResponse.json(
      { error: parsedBody.status === 413 ? "Request body is too large." : "Request body must be valid JSON." },
      { status: parsedBody.status },
    );
  }
  if (!parsedBody.value || typeof parsedBody.value !== "object" || Array.isArray(parsedBody.value)) {
    return NextResponse.json({ error: "Request body must be a JSON object." }, { status: 400 });
  }

  const body = parsedBody.value as Record<string, unknown>;
  if (typeof body.paymentId !== "string" || body.paymentId.length < 1 || body.paymentId.length > 200) {
    return NextResponse.json({ error: "paymentId is required or invalid." }, { status: 400 });
  }

  try {
    const payment = await confirmSubscriptionPayment(body.paymentId, {
      provider: typeof body.provider === "string" && body.provider.length <= 80 ? body.provider : undefined,
      providerPaymentId: typeof body.providerPaymentId === "string" && body.providerPaymentId.length <= 200
        ? body.providerPaymentId
        : undefined,
      providerCheckoutId: typeof body.providerCheckoutId === "string" && body.providerCheckoutId.length <= 200
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
    const message = error instanceof Error ? error.message : "";
    if ([
      "Account is pending deletion.",
      "Account is suspended.",
      "Subscription payment is not payable.",
      "Payment currency does not match the account market.",
      "This account is not eligible for paid weekly access.",
    ].includes(message)) {
      return NextResponse.json(
        { error: "This subscription payment can no longer be confirmed." },
        { status: 409 },
      );
    }
    console.error("Subscription webhook could not confirm payment.", {
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
    return NextResponse.json(
      { error: "Unable to confirm subscription payment." },
      { status: 500 },
    );
  }
}

export const POST = withApiMetrics("/api/subscription/webhook", POSTHandler);
