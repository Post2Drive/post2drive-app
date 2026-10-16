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

    return NextResponse.json(ÂˆİXØÙ\ÜÎˆYKˆ^[Y[Yˆ^[Y[šYˆİ]\Îˆ^[Y[œİ]\ËˆXØÙ\ÜÔİ\Y]ˆ^[Y[˜XØÙ\ÜÔİ\Y]ˆXØÙ\ÜÑ[™Ğ]ˆ^[Y[˜XØÙ\ÜÑ[™Ğ]ˆJNÂˆHØ]Ú
\œ›ÜŠHÂˆÛÛœİY\ÜØYÙHBˆ\œ›Üˆ[œİ[˜Ù[Ùˆ\œ›Ü‚ˆÈ\œ›Ü‹›Y\ÜØYÙBˆˆ•[˜X›HÈÛÛ™š\›HİXœØÜš\[Ûˆ^[Y[ˆÂ‚ˆ™]\›ˆ™^™\ÜÛœÙKšœÛÛŠˆÈ\œ›ÜˆY\ÜØYÙHKˆÈİ]\ÎˆBˆ
NÂˆBŸB‚™^ÜÛÛœİÔÕHÚ]\SY]šXÜÊ‹Ø\KÜİXœØÜš\[Û‹İÙXšÛÚÈ‹ÔÕ[™\ŠNÂ