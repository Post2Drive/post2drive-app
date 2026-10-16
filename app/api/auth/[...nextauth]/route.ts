import { withApiMetrics } from "@/lib/apiMetrics";
import NextAuth from "next-auth";
import { authOptions } from "@/lib/auth";

const handler = NextAuth(authOptions);

export const GET = withApiMetrics("/api/auth/[...nextauth]", handler);
export const POST = withApiMetrics("/api/auth/[...nextauth]", handler);
