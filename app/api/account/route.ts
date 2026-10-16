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

async function PATCHHandler(
  req: Request
) {
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

  const userId =
    (session.user as any).id;

  const body = await req.json();

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

  const account =
    await prisma.account.findUnique({
      where: {
        id: accountId,
      },
    });

  if (!account) {
    return NextResponse.json(
      { error: "Account not found." },
      { status: 404 }
    );
  }

  const requestedCountry = country || account.country;
  const requestedCurrency = currency || account.currency;
  if (!isSupportedMarket({ country: account.country, currency: account.currency })) {
    return NextResponse.json({ error: "This account's market configuration is unsupported. Contact support." }, { status: 409 });
  }
  if (requestedCountry !== account.country || requestedCurrency !== account.currency) {
    return NextResponse.json({
      error: "Country and currency are fixed at signup to protect marketplace separation. Create a new account for another market.",
      code: "MARKET_IMMUTABLE",
    }, { status: 409 });
  }

  if (newPassword) {
    if (!currentPassword) {
      return NextResponse.json(
        {
          error:
            "Current password is required to set a new one.",
        },
        { status: 400 }
      );
    }

    const user =
      await prisma.user.findUnique({
        where: {
          id: userId,
        },
      });

    if (!user) {
      return NextResponse.json(
        { error: "User not found." },
        { status: 404 }
      );
    }

    const valid =
      await bcrypt.compare(
        currentPassword,
        user.passwordHash
      );

    if (!valid) {
      return NextResponse.json(
        {
          error:
            "Current password is incorrect.",
        },
        { status: 403 }
      );
    }

    if (newPassword.length < 8) {
      return NextResponse.json(
        {
          error:
            "New password must be at least 8 characters.",
        },
        { status: 400 }
      );
    }

    const passwordHash =
      await bcrypt.hash(
        newPassword,
        10
      );

    await prisma.user.update({
      where: {
        id: userId,
      },
      data: {
        passwordHash,
      },
    });
  }

  if (name || phone) {
    await prisma.user.update({
      where: {
        id: userId,
      },
      data: {
        ...(name && { name }),
        ...(phone && { phone }),
      },
    });
  }

  const accountData: any = {};

  if (companyName) {
    accountData.companyName =
      companyName;
  }

  if (
    typeof marketingConsent ===
    "boolean"
  ) {
    accountData.marketingConsent =
      marketingConsent;

    accountData.marketingConsentAt =
      new Date();
  }

  if (
    Object.keys(accountData).length >
    0
  ) {
    await prisma.account.update({
      where: {
        id: accountId,
      },
      data: accountData,
    });
  }

  return NextResponse.json({
    success: true,
    ukPromotionEligible:
      isUkAccount({
        country: account.country,
        currency: account.currency,
      }),
  });
}
async function DELETEHandler(req: Request) {
  const session = await getServerSession(authOptions);
  if (!session?.user) return NextResponse.json({ error: "Authentication required." }, { status: 401 });
  const accountId = (session.user as any).accountId as string | undefined;
  const userId = (session.user as any).id as string | undefined;
  if (!accountId || !userId) return NextResponse.json({ error: "Invalid session." }, { status: 401 });

  let body: { currentPassword?: unknown; confirm?: unknown };
  try { body = await req.json(); } catch { return NextResponse.json({ error: "Invalid request body." }, { status: 400 }); }
  if (body.confirm !== "DELETE") return NextResponse.json({ error: "Type DELETE to confirm account deletion." }, { status: 400 });
  if (typeof body.currentPassword !== "string" || !body.currentPassword) return NextResponse.json({ error: "Your current password is required." }, { status: 400 });

  const user = await prisma.user.findUnique({ where: { id: userId }, include: { account: true } });
  if (!user || user.accountId !== accountId || user.account.deletionRequestedAt) return NextResponse.json({ error: "Account not found or already pending deletion." }, { status: 404 });
  const valid = await bcrypt.compare(body.currentPassword, user.passwordHash);
  if (!valid) return NextResponse.json({ error: "Current password is incorrect." }, { status: 403 });

  const stamp = new Date();
  const suffix = randomBytes(10).toString("hex");
  const anonymizedPasswordHash = await bcrypt.hash(randomBytes(48).toString("hex"), 10);
  await prisma.$transaction(async (tx) => {
    const users = await tx.user.findMany({ where: { accountId }, select: { id: true } });
    const userIds = users.map((item) => item.id);
    if (userIds.length) {
      await tx.emailVerificationToken.deleteMany({ where: { userId: { in: userIds } } });
      await tx.passwordResetToken.deleteMany({ where: { userId: { in: userIds } } });
      await tx.user.updateMany({
        where: { id: { in: userIds } },
        data: {
          name: "Deleted user",
          email: `deleted+${suffix}@post2drive.invalid`,
          phone: "",
          passwordHash: anonymizedPasswordHash,
          emailVerifiedAt: null,
        },
      });
    }
    await tx.account.update({
      where: { id: accountId },
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
  });

  return NextResponse.json({ success: true, message: "Account access has been disabled and personal account details anonymised. Limited job, payment and audit records may remain to protect other users and fulfil legal obligations." });
}

export const GET = withApiMetrics("/api/account", GETHandler);
export const PATCH = withApiMetrics("/api/account", PATCHHandler);
export const DELETE = withApiMetrics("/api/account", DELETEHandler);
