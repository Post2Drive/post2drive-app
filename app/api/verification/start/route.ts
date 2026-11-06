import { withApiMetrics } from "@/lib/apiMetrics";
import { enforceRateLimit } from "@/lib/rateLimit";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import {
  createVerificationAttempt,
} from "@/lib/verification";
import { ORDER_BLOCK_MESSAGES } from "@/lib/verificationProcess";

async function POSTHandler(req: Request) {
  const session = await getServerSession(authOptions);

  if (!session) {
    return NextResponse.json({ error: "Not logged in." }, { status: 401 });
  }

  const accountId = (session.user as any)?.accountId;
  if (!accountId) {
    return NextResponse.json({ error: "Account not found." }, { status: 404 });
  }
  const writeLimit = await enforceRateLimit(req, { scope: "verification-start", identity: accountId, limit: 10, windowMs: 60 * 60 * 1000 });
  if (writeLimit) return writeLimit;

  try {
    const userId = (session.user as any)?.id as string | undefined;
    const result = await createVerificationAttempt(accountId, userId);
    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    const controlledErrors = new Map([
      ["Account not found.", { status: 404, error: "Account not found." }],
      ["Account is suspended.", { status: 403, error: "Suspended accounts cannot start verification." }],
      ["Person verification is only available to GB + GBP accounts.", {
        status: 403,
        error: "Person verification is only available to GB + GBP accounts.",
      }],
      // Order is enforced server-side: email, then phone OTP, then person ID.
      [ORDER_BLOCK_MESSAGES.email_unverified, { status: 409, error: ORDER_BLOCK_MESSAGES.email_unverified }],
      [ORDER_BLOCK_MESSAGES.phone_unverified, { status: 409, error: ORDER_BLOCK_MESSAGES.phone_unverified }],
    ]);
    const controlled = controlledErrors.get(message);
    if (controlled) {
      return NextResponse.json({ error: controlled.error }, { status: controlled.status });
    }

    console.error("Verification start failed.", {
      errorName: error instanceof Error ? error.name : "UnknownError",
    });
    return NextResponse.json(
      { error: "Unable to start verification. Try again or contact support." },
      { status: 500 },
    );
  }
}

export const POST = withApiMetrics("/api/verification/start", POSTHandler);
