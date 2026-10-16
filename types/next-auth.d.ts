import "next-auth";
import "next-auth/jwt";

declare module "next-auth" {
  interface Session {
    user: {
      id: string;
      accountId: string;
      accountType: string;
      currency: string;
      country: string;
    } & DefaultSession["user"];
  }

  interface User {
    id: string;
    accountId: string;
    accountType: string;
    currency: string;
    country: string;
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
    accountId?: string;
    accountType?: string;
    currency?: string;
    country?: string;
  }
}
