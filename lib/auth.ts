import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { emailVerificationEnabled } from "@/lib/emailVerification";
import { checkRateLimit, clientNetworkIdentity } from "@/lib/rateLimit";
import { isAuthorizedQaRunId } from "@/lib/qaRunAuthorization";

export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    CredentialsProvider({
      name: "Email and password",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials, req) {
        if (!credentials?.email || !credentials?.password) return null;

        const normalizedEmail = credentials.email.trim().toLowerCase();
        const rawQaRunId = req.headers?.["x-post2drive-qa-run-id"];
        const qaRunId = Array.isArray(rawQaRunId) ? rawQaRunId[0] : rawQaRunId;
        const authorizedQaRun = qaRunId ? await isAuthorizedQaRunId(qaRunId) : false;

        if (!authorizedQaRun) {
          const headers = new Headers((req.headers ?? {}) as unknown as HeadersInit);
          const networkIdentity = clientNetworkIdentity(
            new Request("https://post2drive.invalid/", { headers }),
          );

          let networkLimit;
          let emailLimit;
          try {
            [networkLimit, emailLimit] = await Promise.all([
              checkRateLimit({
                scope: "login-network",
                identity: networkIdentity,
                limit: 20,
                windowMs: 15 * 60 * 1000,
              }),
              checkRateLimit({
                scope: "login-email",
                identity: normalizedEmail,
                limit: 10,
                windowMs: 15 * 60 * 1000,
              }),
            ]);
          } catch {
            // Fail closed if the database-backed login throttle is unavailable.
            console.error("Login rate-limit control unavailable.");
            return null;
          }

          if (!networkLimit.allowed || !emailLimit.allowed) return null;
        }

        const user = await prisma.user.findUnique({
          where: { email: normalizedEmail },
          include: { account: true },
        });
        if (!user || user.account.deletionRequestedAt) return null;

        const valid = await bcrypt.compare(credentials.password, user.passwordHash);
        if (!valid) return null;

        // Tester applicants can sign in to add the vehicle details needed for admin review.
        // All other new accounts must verify email when the feature is enabled.
        if (
          emailVerificationEnabled() &&
          !user.emailVerifiedAt &&
          user.account.testerApprovalStatus !== "pending"
        ) {
          return null;
        }

        return {
          id: user.id,
          email: user.email,
          name: user.name,
          accountId: user.accountId,
          accountType: "both",
          currency: user.account.currency,
          country: user.account.country,
        } as any;
      },
    }),
  ],
  callbacks: {
    async jwt({ token, user }) {
      if (user) {
        token.id = (user as any).id;
        token.accountId = (user as any).accountId;
        token.accountType = (user as any).accountType;
        token.currency = (user as any).currency;
        token.country = (user as any).country;
      }

      // Password changes revoke every previously issued JWT. The policy is
      // intentionally global per user: all devices must authenticate again.
      if (token.id) {
        const authUser = await prisma.user.findUnique({
          where: { id: String(token.id) },
          select: { passwordChangedAt: true },
        });
        const issuedAtMs = typeof token.iat === "number" ? token.iat * 1000 : null;
        token.passwordChanged = !authUser ||
          Boolean(authUser.passwordChangedAt && issuedAtMs !== null &&
            issuedAtMs < authUser.passwordChangedAt.getTime());
      }

      // Re-check persisted account state on every session refresh. NextAuth's
      // JWT callback must return a JWT, so mark revoked tokens and reject them
      // in the session callback instead of returning null from this callback.
      if (token.accountId) {
        const account = await prisma.account.findUnique({
          where: { id: String(token.accountId) },
          select: { deletionRequestedAt: true },
        });
        token.accountDeleted = !account || Boolean(account.deletionRequestedAt);
      }

      return token;
    },
    async session({ session, token }) {
      if (token.accountDeleted || token.passwordChanged) return null as any;

      if (session.user) {
        (session.user as any).id = token.id;
        (session.user as any).accountId = token.accountId;
        (session.user as any).accountType = token.accountType;
        (session.user as any).currency = token.currency;
        (session.user as any).country = token.country;
      }
      return session;
    },
  },
};
