import { withApiMetrics } from "@/lib/apiMetrics";
import { NextResponse } from "next/server";
import { timingSafeEqual } from "node:crypto";
import { readBoundedJson } from "@/lib/requestBody";
import {
  markVerificationSuccessful,
  markVerificationFailed,
} from "@/lib/verification";

function constantTimeSecretEqual(expected: string, supplied: string) {
  const expectedBytes = Buffer.from(expected, "utf8");
  const suppliedBytes = Buffer.from(supplied, "utf8");
  return expectedBytes.length > 0 &&
    expectedBytes.length === suppliedBytes.length &&
    timingSafeEqual(expectedBytes, suppliedBytes);
}

async function POSTHandler(req: Request) {
  const secret = process.env.VERIFICATION_WEBHOOK_SECRET;
  if (!secret) {
    return NextResponse.json({ error: "Verification webhook is not configured." }, { status: 503 });
  }

  const providedSecret = req.headers.get("x-verification-webhook-secret") || "";
  if (!constantTimeSecretEqual(secret, providedSecret)) {
    return NextResponse.json({ error: "Invalid webhook credentials." }, { status: 401 });
  }

  const parsedBody = await readBoundedJson(req, 16 * 1024);
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
  const attemptId = typeof body.attemptId === "string" ? body.attemptId.trim() : "";
  const status = body.status;
  const providerReference = body.providerReference;
  if (!attemptId || attemptId.length > 128 || typeof status !== "string") {
    return NextResponse.json({ error: "attemptId and status are required and must be valid." }, { status: 400 });
  }
  if (providerReference !== undefined && (typeof providerReference !== "string" || providerReference.length > 200)) {
    return NextResponse.json({ error: "providerReference is invalid." }, { status: 400 });
  }

  try {
    if (status === "successful" || status === "verified") {
      const account = await markVerificationSuccessful(
        attemptId,
        typeof providerReference === "string" ? providerReference : undefined,
      );
      return NextResponse.json({
        success: true,
        verificationStatus: account.verificationStatus,
        promotionStarted: account.country === "GB" && account.currency === "GBP",
      });
    }

    if (status === "failed") {
      const result = await markVerificationFailed(attemptId, body.failureReasons);
      return NextResponse.json({ success: true, ...result });
    }

    return NextResponse.json({ error: "Unsupported verification status." }, { status: 400 });
  } catch (error) {
    console.error("Verification webhook processing failed.", {
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
    return NextResponse.json({ error: "Verification processing failed." }, { status: 500 });
  }
}

export const POST = withApiMetrics("/api/verification/start/webhook", POSTHandler);
