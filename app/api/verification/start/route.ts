import { withApiMetrics } from "@/lib/apiMetrics";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import {
  createVerificationAttempt,
} from "@/lib/verification";

async function POSTHandler() {
  const session =
    await getServerSession(
      authOptions
    );

  if (!session) {
    return NextResponse.json(
      {
        error:
          "Not logged in.",
      },
      { status: 401 }
    );
  }

  const accountId =
    (session.user as any)
      ?.accountId;

  if (!accountId) {
    return NextResponse.json(
      {
        error:
          "Account not found.",
      },
      { status: 404 }
    );
  }

  try {
    const result =
      await createVerificationAttempt(
        accountId
      );

    return NextResponse.json({
      success: true,
      ...result,
    });
  } catch (error) {
    console.error(
      "Verification start error:",
      error
    );

    return NextResponse.json(
      {
        error:
          error instanceof Error
            ? error.message
            : "Unable to start verification.",
      },
      { status: 400 }
    );
  }
}
export const POST = withApiMetrics("/api/verification/start", POSTHandler);
