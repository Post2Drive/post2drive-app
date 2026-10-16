import { withApiMetrics } from "@/lib/apiMetrics";
import { NextResponse } from "next/server";
import {
  markVerificationSuccessful,
  markVerificationFailed,
} from "@/lib/verification";

async function POSTHandler(
  req: Request
) {
  const secret =
    process.env.VERIFICATION_WEBHOOK_SECRET;

  if (!secret) {
    return NextResponse.json(
      {
        error:
          "Verification webhook is not configured.",
      },
      { status: 503 }
    );
  }

  const providedSecret =
    req.headers.get(
      "x-verification-webhook-secret"
    );

  if (
    !providedSecret ||
    providedSecret !== secret
  ) {
    return NextResponse.json(
      {
        error:
          "Invalid webhook credentials.",
      },
      { status: 401 }
    );
  }

  const body =
    await req.json();

  const {
    attemptId,
    status,
    providerReference,
    failureReasons,
  } = body;

  if (!attemptId || !status) {
    return NextResponse.json(
      {
        error:
          "attemptId and status are required.",
      },
      { status: 400 }
    );
  }

  try {
    if (
      status === "successful" ||
      status === "verified"
    ) {
      const account =
        await markVerificationSuccessful(
          attemptId,
          providerReference
        );

      return NextResponse.json({
        success: true,
        verificationStatus:
          account.verificationStatus,
        promotionStarted:
          account.country ===
            "GB" &&
          account.currency ===
            "GBP",
      });
    }

    if (
      status === "failed"
    ) {
      const result =
        await markVerificationFailed(
          attemptId,
          failureReasons
        );

      return NextResponse.json({
        success: true,
        ...result,
      });
    }

    return NextResponse.json(
      {
        error:
          "Unsupported verification status.",
      },
      { status: 400 }
    );
  } catch (error) {
    console.error(
      "Verification webhook error:",
      error
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Verification processing failed.",
      },
      { status: 500 }
    );
  }
}
export const POST = withApiMetrics("/api/verification/start/webhook", POSTHandler);
