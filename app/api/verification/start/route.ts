import { withApiMetrics } from "@/lib/apiMetrics";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import {
  createVerificationAttempt,
} from "@/lib/verification";

async function POSTHandler() {
  const session = await getServerSession(authOptions);

  if (!session) {
    return NextResponse.json({ error: "Not logged in." }, { status: 401 });
  }

  const accountId = (session.user as any)?.accountId;
  if (!accountId) {
    return NextResponse.json({ error: "Account not found." }, { status: 404 });
  }

  try {
    const result = await createVerificationAttempt(accountId);
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
      ["The maximum automated verification attempts have been reached. The account requires final review.", {
        status: 409,
        error: "The maximum automated verification attempts have been reached. The account requires final review.",
      }],
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
