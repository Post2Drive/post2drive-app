import { NextResponse } from "next/server";

export const dynamic = "force-dynamic";

/**
 * The legacy in-app performance dashboard was retired in favour of /admin-access.
 * Keep this route as an explicit tombstone so stale clients fail clearly without
 * querying the application database with its normal credentials.
 */
export async function GET() {
  return NextResponse.json(
    {
      error: "This endpoint has been retired.",
      replacement: "/admin-access",
    },
    {
      status: 410,
      headers: { "Cache-Control": "no-store" },
    }
  );
}
