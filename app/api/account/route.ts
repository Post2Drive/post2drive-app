import { withApiMetrics } from "@/lib/apiMetrics";
import { NextResponse } from "next/server";
import { getServerSession } from "next-auth";
import bcrypt from "bcryptjs";
import { randomBytes } from "crypto";
import { isSupportedMarket } from "@/lib/market";
import { authOptions } from "@/lib/auth";
import { Prisma } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import {
  isUkAccount,
  isUkPromotionLocked,
} from "@/lib/uk";

async function GETHandler() {
  const session =
    await getServerSession(authOptions);

  if (!session) {
    return NextResponse.json(
      { error: "Not logged in." },
      { status: 401 }
    );
  }

  const accountId =
    (session.user as any).accountId;

  const account =
    await prisma.account.findUnique({
      where: {
        id: accountId,
      },
      include: {
        users: {
          select: {
            id: true,
            name: true,
            email: true,
            phone: true,
          },
          take: 1,
        },
      },
    });

  if (!account) {
    return NextResponse.json(
      { error: "Account not found." },
      { status: 404 }
    );
  }

  return NextResponse.json({
    account,
    ukPromotionEligible:
      isUkAccount(account),
  });
}

async function PATCHHandler(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Not logged in." }, { status: 401 });
  }

  const accountId = (session.user as any).accountId as string | undefined;
  const userId = (session.user as any).id as string | undefined;
  if (!accountId || !userId) {
    return NextResponse.json({ error: "Invalid session." }, { status: 401 });
  }

  let body: Record<string, unknown>;
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const {
    name,
    phone,
    companyName,
    country,
    currency,
    marketingConsent,
    currentPassword,
    newPassword,
  } = body;

  if (newPassword !== undefined && typeof newPassword !== "string") {
    return NextResponse.json({ error: "New password must be a string." }, { status: 400 });
  }
  if (currentPassword !== undefined && typeof currentPassword !== "string") {
    return NextResponse.json({ error: "Current password must be a string." }, { status: 400 });
  }

  const result = await prisma.$transaction(async (tx) => {
    // Serialize account mutations with deletion. The lock is held through every
    // write below, so DELETE cannot anonymize the account between this check
    // and a profile/password update, and a later PATCH cannot revive it.
    const lockedAccounts = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT "id" FROM "Account"
      WHERE "id" = ${accountId} AND "deletionRequestedAt" IS NULL
      FOR UPDATE
    `);
    if (lockedAccounts.length !== 1) {
      return { status: 404, error: "Account not found or already pending deletion." } as const;
    }

    const account = await tx.account.findUnique({ where: { id: accountId } });
    if (!account || account.deletionRequestedAt) {
      return { status: 404, error: "Account not found or already pending deletion." } as const;
    }

    const requestedCountry = country || account.country;
    const requestedCurrency = currency || account.currency;
    if (!isSupportedMarket({ country: account.country, currency: account.currency })) {
      return { status: 409, error: "This account's market configuration is unsupported. Contact support." } as const;
    }
    if (requestedCountry !== account.country || requestedCurrency !== account.currency) {
      return {
        status: 409,
        error: "Country and currency are fixed at signup to protect marketplace separation. Create a new account for another market.",
        code: "MARKET_IMMUTABLE",
      } as const;
    }

    if (newPassword) {
      if (!currentPassword) {
        return { status: 400, error: "Current password is required to set a new one." } as const;
      }
      const user = await tx.user.findFirst({ where: { id: userId, accountId } });
      if (!user) {
        return { status: 404, error: "User not found." } as const;
      }
      const valid = await bcrypt.compare(currentPassword, user.passwordHash);
      if (!valid) {
        return { status: 403, error: "Current password is incorrect." } as const;
      }
      if (newPassword.length < 8) {
        return { status: 400, error: "New password must be at least 8 characters." } as const;
      }
      const passwordHash = await bcrypt.hash(newPassword, 10);
      await tx.user.update({ where: { id: userId }, data: { passwordHash, sessionVersion: { increment: 1 } } });
    }

    if (name || phone) {
      await tx.user.update({
        where: { id: userId },
        data: {
          ...(typeof name === "string" && name && { name }),
          ...(typeof phone === "string" && phone && { phone }),
        },
      });
    }

    const accountData: Record<string, unknown> = {};
    if (typeof companyName === "string" && companyName) {
      accountData.companyName = companyName;
    }
    if (typeof marketingConsent === "boolean") {
      accountData.marketingConsent = marketingConsent;
      accountData.marketingConsentAt = new Date();
    }

    if (Object.keys(accountData).length > 0) {
      await tx.account.update({ where: { id: accountId }, data: accountData as Prisma.AccountUpdateInput });
    }

    return {
      status: 200,
      success: true,
      ukPromotionEligible: isUkAccount({ country: account.country, currency: account.currency }),
    } as const;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });

  if (result.status !== 200) {
    return NextResponse.json({ error: result.error, ...("code" in result ? { code: result.code } : {}) }, { status: result.status });
  }
  return NextResponse.json({ success: result.success, ukPromotionEligible: result.ukPromotionEligible });
}
async function DELETEHandler(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) {
    return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  }
  const accountId = (session.user as any).accountId as string | undefined;
  const userId = (session.user as any).id as string | undefined;
  if (!accountId || !userId) {
    return NextResponse.json({ error: "Invalid session." }, { status: 401 });
  }

  let body: { currentPassword?: unknown; confirm?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }
  if (body.confirm !== "DELETE") {
    return NextResponse.json({ error: "Type DELETE to confirm account deletion." }, { status: 400 });
  }
  if (typeof body.currentPassword !== "string" || !body.currentPassword) {
    return NextResponse.json({ error: "Your current password is required." }, { status: 400 });
  }

  const stamp = new Date();
  const suffix = randomBytes(10).toString("hex");
  const anonymizedPasswordHash = await bcrypt.hash(randomBytes(48).toString("hex"), 10);

  const result = await prisma.$transaction(async (tx) => {
    // Use the same account-row lock as PATCH. Re-check credentials only after
    // acquiring it, so a concurrent password change cannot race deletion.
    const lockedAccounts = await tx.$queryRaw<Array<{ id: string }>>(Prisma.sql`
      SELECT "id" FROM "Account"
      WHERE "id" = ${accountId} AND "deletionRequestedAt" IS NULL
      FOR UPDATE
    `);
    if (lockedAccounts.length !== 1) {
      return { status: 404, error: "Account not found or already pending deletion." } as const;
    }

    const user = await tx.user.findFirst({
      where: { id: userId, accountId },
      include: { account: true },
    });
    if (!user || user.account.deletionRequestedAt) {
      return { status: 404, error: "Account not found or already pending deletion." } as const;
    }
    const valid = await bcrypt.compare(body.currentPassword as string, user.passwordHash);
    if (!valid) {
      return { status: 403, error: "Current password is incorrect." } as const;
    }

    const users = await tx.user.findMany({ where: { accountId }, select: { id: true } });
    const userIds = users.map((item) => item.id);
    if (userIds.length) {
      await tx.emailVerificationToken.deleteMany({ where: { userId: { in: userIds } } });
      await tx.passwordResetToken.deleteMany({ where: { userId: { in: userIds } } });
      await tx.user.updateMany({
        where: { id: { in: userIds }, accountId },
        data: {
          name: "Deleted user",
          email: `deleted+${suffix}@post2drive.invalid`,
          phone: "",
          passwordHash: anonymizedPasswordHash,
          sessionVersion: { increment: 1 },
          emailVerifiedAt: null,
        },
      });
    }

    const accountUpdate = await tx.account.updateMany({
      where: { id: accountId, deletionRequestedAt: null },
      data: {
        companyName: "Deleted account",
        companyNumber: null,
        marketingConsent: false,
        marketingConsentAt: null,
        marketResearch: Prisma.DbNull,
        deletionRequestedAt: stamp,
        isTester: false,
        testerApprovalStatus: null,
        subscriptionStatus: "inactive",
        subscriptionPlanKey: null,
        subscriptionStartedAt: null,
        subscriptionEndsAt: null,
        promotionParticipant: false,
        freeEndsAt: null,
        trialEndsAt: null,
      },
    });
    if (accountUpdate.count !== 1) {
      // Throw to roll back the user/token anonymization if the guard ever fails.
      throw new Error("Account deletion lost its locked account row.");
    }

    return {
      status: 200,
      success: true,
      message: "Account access has been disabled and personal account details anonymised. Limited job, payment and audit records may remain to protect other users and fulfil legal obligations.",
    } as const;
  }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });

  if (result.status !== 200) {
    return NextResponse.json({ error: result.error }, { status: result.status });
  }
  return NextResponse.json({ success: result.success, message: result.message });
}
export const GET = withApiMetrics("/api/account", GETHandler);
export const PATCH = withApiMetrics("/api/account", PATCHHandler);
export const DELETE = withApiMetrics("/api/account", DELETEHandler);
