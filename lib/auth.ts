import { NextAuthOptions } from "next-auth";
import CredentialsProvider from "next-auth/providers/credentials";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { emailVerificationEnabled } from "@/lib/emailVerification";

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
      async authorize(credentials) {
        if (!credentials?.email || !credentials?.password) return null;

        const user = await prisma.user.findUnique({
          where: { email: credentials.email.trim().toLowerCase() },
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
      return token;
    },
    async session({ session, token }) {
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