import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { emailVerificationRequiredForCountry } from "@/lib/emailVerification";
import { checkRateLimit, clientNetworkIdentity } from "@/lib/rateLimit";
import { isAuthorizedQaRunId } from "@/lib/qaRunAuthorization";
import { isQaRunnerEnabled } from "@/lib/qaRunnerGuard";

export const authOptions: NextAuthOptions = {
  session: { strategy: "jwt" },
  pages: { signIn: "/login" },
  providers: [
    CredentialsProvider({
      name: "Email or India phone and password",
      credentials: {
        email: { label: "Email or phone number (India accounts)", type: "text" },
        password: { label: "Password", type: "password" },
      },
      async authorize(credentials, req) {
        if (!credentials?.email || !credentials?.password) return null;

        const identifier = credentials.email.trim();
        const normalizedEmail = identifier.toLowerCase();
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

        const looksLikeEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail);
        let user = looksLikeEmail
          ? await prisma.user.findUnique({ where: { email: normalizedEmail }, include: { account: { include: { qaTestAccounts: { select: { runId: true } } } } } })
          : null;

        // India accounts may register without email. Phone sign-in is India-only
        // and fails closed if legacy duplicate phone numbers make the identity ambiguous.
        if (!looksLikeEmail) {
          const phoneMatches = await prisma.user.findMany({
            where: { phone: identifier, account: { country: "IN" } },
            include: { account: { include: { qaTestAccounts: { select: { runId: true } } } } },
            take: 2,
          });
          if (phoneMatches.length === 1) user = phoneMatches[0];
        }
        if (!user || user.account.deletionRequestedAt) return null;

        const valid = await bcrypt.compare(credentials.password, user.passwordHash);
        if (!valid) return null;

        // Tester applicants can sign in to add the vehicle details needed for admin review.
        // All other new accounts must verify email when the feature is enabled.
        const allowedStagingPilotLogin =
          isQaRunnerEnabled() &&
          user.account.isTester &&
          user.account.country === "GB" &&
          user.account.currency === "GBP" &&
          Array.isArray(user.account.qaTestAccounts) &&
          user.account.qaTestAccounts.some((entry) => entry.runId === "uk-market-student-qa");

        if (
          emailVerificationRequiredForCountry(user.account.country) &&
          !user.emailVerifiedAt &&
          user.account.testerApprovalStatus !== "pending" &&
          !allowedStagingPilotLogin
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
          sessionVersion: user.sessionVersion,
          passwordChangedAt: user.passwordChangedAt?.getTime() ?? null,
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
        (token as any).sessionVersion =
          typeof (user as any).sessionVersion === "number" ? (user as any).sessionVersion : 0;
        (token as any).passwordChangedAt = (user as any).passwordChangedAt ?? null;
        (token as any).accountDeleted = false;
        (token as any).passwordChanged = false;
        (token as any).sessionRevoked = false;
      } else if (token.id && !(token as any).sessionRevoked) {
        // One database read checks account deletion, session-version revocation
        // and the password-change timestamp. Legacy tokens without a version
        // fail closed and must sign in again.
        if (typeof (token as any).sessionVersion !== "number") {
          (token as any).accountDeleted = true;
          (token as any).passwordChanged = true;
          (token as any).sessionRevoked = true;
        } else {
          const currentUser = await prisma.user.findUnique({
            where: { id: String(token.id) },
            select: {
              sessionVersion: true,
              passwordChangedAt: true,
              account: { select: { deletionRequestedAt: true } },
            },
          });
          const account = currentUser?.account;
          (token as any).accountDeleted = !account || Boolean(account.deletionRequestedAt);
          const currentPasswordChangedAt = currentUser?.passwordChangedAt?.getTime() ?? null;
          const tokenPasswordChangedAt =
            typeof (token as any).passwordChangedAt === "number"
              ? (token as any).passwordChangedAt
              : null;
          (token as any).passwordChanged =
            !currentUser ||
            tokenPasswordChangedAt !== currentPasswordChangedAt ||
            currentUser.sessionVersion !== (token as any).sessionVersion;
          (token as any).sessionRevoked =
            (token as any).accountDeleted || (token as any).passwordChanged;
        }
      }

      return token;
    },
    async session({ session, token }) {
      if ((token as any).accountDeleted || (token as any).passwordChanged) return null as any;
      if ((token as any).sessionRevoked) return null as any;
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
