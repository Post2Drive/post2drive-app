import { withApiMetrics } from "@/lib/apiMetrics";
import { NextResponse } from "next/server";
import { createHash } from "crypto";
import bcrypt from "bcryptjs";
import { prisma } from "@/lib/prisma";
import { generateDisplayId } from "@/lib/displayId";
import { isUkAccount } from "@/lib/uk";
import { calculatePromotionalEnd, getPromotion } from "@/lib/promotion";
import { createEmailVerificationToken, emailDeliveryConfigured, emailVerificationEnabled, sendVerificationEmail } from "@/lib/emailVerification";
import { marketForAccount } from "@/lib/market";
import { validateSharedUkPilotCode } from "@/lib/pilotAccess";
import { enforceRateLimit } from "@/lib/rateLimit";
import { readBoundedJson } from "@/lib/requestBody";

const MARKET_RESEARCH_OPTIONS = {
  role: ["driver", "fleet", "shipper", "broker"],
  currentDiscovery: ["whatsapp", "calls", "platforms", "agents", "other"],
  biggestChallenge: ["consistent-work", "trusted-drivers", "empty-miles", "price-transparency", "payment-delays", "other"],
  preferredAccess: ["free-trial-weekly", "free-trial-payg", "monthly", "longer-plan"],
} as const;

function normalizeMarketResearch(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return undefined;
  const input = value as Record<string, unknown>;
  const output: Record<string, string> = {};
  for (const key of Object.keys(MARKET_RESEARCH_OPTIONS) as Array<keyof typeof MARKET_RESEARCH_OPTIONS>) {
    const answer = input[key];
    if (typeof answer === "string" && (MARKET_RESEARCH_OPTIONS[key] as readonly string[]).includes(answer)) {
      output[key] = answer;
    }
  }
  return Object.keys(output).length ? output : undefined;
}

async function POSTHandler(
  req: Request
) {
  const networkLimit = await enforceRateLimit(req, { scope: "signup-network", limit: 12, windowMs: 15 * 60 * 1000 });
  if (networkLimit) return networkLimit;

  try {
    const parsedBody = await readBoundedJson(req, 16 * 1024);
    if (!parsedBody.ok) {
      return NextResponse.json(
        { error: parsedBody.status === 413 ? "Request body is too large." : "Request body must be valid JSON." },
        { status: parsedBody.status },
      );
    }
    if (!parsedBody.value || typeof parsedBody.value !== "object" || Array.isArray(parsedBody.value)) {
      return NextResponse.json({ error: "Request body must be a JSON object." }, { status: 400 });
    }
    const body = parsedBody.value as {
      name?: unknown;
      email?: unknown;
      phone?: unknown;
      password?: unknown;
      companyName?: unknown;
      planType?: unknown;
      fleetVehicleCount?: unknown;
      isSoleTrader?: unknown;
      country?: unknown;
      currency?: unknown;
      referralCode?: unknown;
      testerCode?: unknown;
      termsAccepted?: unknown;
      termsVersion?: unknown;
      marketResearch?: unknown;
    };

    const {
      name,
      email,
      phone,
      password,
      companyName,
      planType,
      fleetVehicleCount,
      isSoleTrader,
      country,
      currency,
      referralCode,
      testerCode,
      termsAccepted,
      termsVersion,
      marketResearch,
    } = body;

    if (
      !name ||
      !email ||
      !phone ||
      !password ||
      (!isSoleTrader && !String(companyName || "").trim()) ||
      !country ||
      !currency ||
      termsAccepted !== true ||
      termsVersion !== "2026-10-16"
    ) {
      return NextResponse.json(
        {
          error:
            "Missing required fields.",
        },
        { status: 400 }
      );
    }

    if (typeof isSoleTrader !== "boolean") {
      return NextResponse.json({ error: "Select whether you are registering as a sole trader." }, { status: 400 });
    }

    if (
      typeof country !== "string" ||
      typeof currency !== "string" ||
      (companyName !== undefined && companyName !== null && typeof companyName !== "string") ||
      (typeof companyName === "string" && companyName.length > 160) ||
      (planType !== undefined && typeof planType !== "string") ||
      (fleetVehicleCount !== undefined && typeof fleetVehicleCount !== "string" && typeof fleetVehicleCount !== "number") ||
      (referralCode !== undefined && (typeof referralCode !== "string" || referralCode.length > 32)) ||
      (testerCode !== undefined && (typeof testerCode !== "string" || testerCode.length > 100))
    ) {
      return NextResponse.json({ error: "One or more request fields have an invalid type." }, { status: 400 });
    }

    const market = marketForAccount({ country, currency });
    if (!market) {
      return NextResponse.json({ error: "Choose one of the supported markets and its matching currency." }, { status: 400 });
    }

    if (typeof name !== "string" || name.trim().length < 2 || name.trim().length > 100 ||
        typeof email !== "string" || email.trim().length > 254 ||
        typeof phone !== "string" || phone.trim().length < 5 || phone.trim().length > 50 ||
        typeof password !== "string" || password.length < 8 || password.length > 128 || Buffer.byteLength(password, "utf8") > 72) {
      return NextResponse.json({ error: "Check your name, email, phone number and password. Passwords must be 8–72 UTF-8 bytes (and no more than 128 characters)." }, { status: 400 });
    }

    const verificationRequired = emailVerificationEnabled();
    const suppliedTesterCode = typeof testerCode === "string" ? testerCode.trim().toUpperCase() : "";
    let testerCodeHash: string | null = null;
    let isPilotAccess = false;
    if (suppliedTesterCode) {
      if (!isUkAccount({ country, currency })) return NextResponse.json({ error: "Tester access is only available for GB accounts using GBP." }, { status: 400 });
      if (referralCode?.trim()) return NextResponse.json({ error: "A tester code cannot be combined with a referral code." }, { status: 400 });
      isPilotAccess = await validateSharedUkPilotCode(suppliedTesterCode, { country, currency });
      if (!isPilotAccess) testerCodeHash = createHash("sha256").update(suppliedTesterCode).digest("hex");
    }
    if (testerCodeHash || isPilotAccess) {
      const promotion = await getPromotion();
      const now = new Date();
      if (!promotion.active || now < promotion.startAt || now > promotion.endAt) {
        return NextResponse.json({ error: "Tester applications are only accepted while the UK promotional programme is active." }, { status: 400 });
      }
    }
    // The shared cohort code bypasses email-verification delivery only inside
    // the guarded staging pilot. Ordinary accounts and one-time tester codes
    // keep the existing email-verification requirements.
    if (verificationRequired && !emailDeliveryConfigured() && !isPilotAccess) {
      return NextResponse.json(
        { error: "Email verification is being configured. Please try again later." },
        { status: 503 }
      );
    }

    const selectedPlan = planType || "individual";
    const parsedFleetVehicleCount = Number(fleetVehicleCount);
    const normalizedCompanyName = (typeof companyName === "string" ? companyName.trim() : "") || (isSoleTrader ? name.trim() : "");

    if (selectedPlan !== "individual" && selectedPlan !== "fleet") {
      return NextResponse.json(
        { error: "Choose an account plan." },
        { status: 400 }
      );
    }

    if ((selectedPlan === "individual" && parsedFleetVehicleCount !== 1) ||
        (selectedPlan === "fleet" && (!Number.isInteger(parsedFleetVehicleCount) || parsedFleetVehicleCount < 2))) {
      return NextResponse.json({ error: "Your plan must match your vehicle count: one vehicle for Individual, 2–55 for Fleet." }, { status: 400 });
    }

    if (
      selectedPlan === "fleet" &&
      (!Number.isInteger(parsedFleetVehicleCount) ||
        parsedFleetVehicleCount < 2 ||
        parsedFleetVehicleCount > 55)
    ) {
      return NextResponse.json(
        { error: "Fleet signup supports 2–55 vehicles. Fleets with 56+ vehicles require custom pricing." },
        { status: 400 }
      );
    }

    let pilotTrialStartedAt: Date | undefined;
    let pilotFreeEndsAt: Date | undefined;
    if (isPilotAccess) {
      pilotTrialStartedAt = new Date();
      const calculatedEnd = await calculatePromotionalEnd({
        country,
        currency,
        planType: selectedPlan,
        trialStartedAt: pilotTrialStartedAt,
        freeMonthsEarned: 0,
      });
      if (!calculatedEnd) {
        return NextResponse.json({ error: "Unable to start the UK staging pilot access window." }, { status: 503 });
      }
      pilotFreeEndsAt = calculatedEnd;
    }

    const normalizedEmail = email.trim().toLowerCase();
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalizedEmail)) {
      return NextResponse.json({ error: "Enter a valid email address." }, { status: 400 });
    }
    const emailLimit = await enforceRateLimit(req, { scope: "signup-email", identity: normalizedEmail, limit: 5, windowMs: 60 * 60 * 1000 });
    if (emailLimit) return emailLimit;

    const existing =
      await prisma.user.findUnique({
        where: {
          email:
            normalizedEmail,
        },
      });

    if (existing) {
      return NextResponse.json(
        {
          error:
            "An account with this email already exists.",
        },
        { status: 409 }
      );
    }

    /*
     * Referral codes currently belong to the
     * UK launch promotion.
     *
     * Therefore a referral code can only be
     * used when the new account explicitly
     * selected GB + GBP.
     */
    if (
      referralCode?.trim() &&
      !isUkAccount({
        country,
        currency,
      })
    ) {
      return NextResponse.json(
        {
          error:
            "Referral promotion is currently available only to United Kingdom accounts using GBP.",
        },
        { status: 400 }
      );
    }

    let referrerId:
      | string
      | null = null;

    if (
      referralCode?.trim()
    ) {
      const referrer =
        await prisma.account.findUnique({
          where: {
            displayId:
              referralCode
                .trim()
                .toUpperCase(),
          },
        });

      if (!referrer) {
        return NextResponse.json(
          {
            error:
              "Invalid referral code.",
          },
          { status: 400 }
        );
      }

      if (
        !isUkAccount(
          referrer
        )
      ) {
        return NextResponse.json(
          {
            error:
              "This referral code is not valid for the UK promotion.",
          },
          { status: 400 }
        );
      }

      referrerId =
        referrer.id;
    }

    const passwordHash =
      await bcrypt.hash(
        password,
        10
      );

    let displayId = "";
    let account: { id: string } | undefined;
    let displayIdCollisionCount = 0;
    let displayIdAttempts = 0;
    const maxDisplayIdAttempts = 5;

    // The unique database constraint is the reservation authority. A preflight
    // SELECT cannot reserve an ID and races under concurrent signup load.
    for (let attempt = 1; attempt <= maxDisplayIdAttempts; attempt++) {
      displayId = generateDisplayId(normalizedCompanyName);
      displayIdAttempts = attempt;
      try {
        account = await prisma.$transaction(
          async (tx) => {
          const createdAccount =
            await tx.account.create({
              data: {
                /*
                 * Legacy AccountType is retained in the database only
                 * for backwards compatibility. All customer accounts
                 * now have unified marketplace capabilities.
                 */
                type: "both",

                planType: selectedPlan,

                fleetVehicleCount:
                  selectedPlan === "fleet"
                    ? parsedFleetVehicleCount
                    : null,

                companyName: normalizedCompanyName,
                termsAcceptedAt: new Date(),
                termsVersion: "2026-10-16",
                marketResearch: country === "IN" ? normalizeMarketResearch(marketResearch) : undefined,

                isSoleTrader:
                  Boolean(
                    isSoleTrader
                  ),

                country,

                currency,

                displayId,
                isTester: isPilotAccess,
                testerApprovalStatus: isPilotAccess ? "approved" : testerCodeHash ? "pending" : undefined,
                promotionParticipant: isPilotAccess,
                trialStartedAt: pilotTrialStartedAt,
                trialEndsAt: pilotFreeEndsAt,
                freeEndsAt: pilotFreeEndsAt,
                subscriptionStatus: isPilotAccess ? "promotional" : undefined,
                lastActivityAt: pilotTrialStartedAt,

                users: {
                  create: {
                    name:
                      name.trim(),

                    email:
                      normalizedEmail,

                    phone:
                      phone.trim(),

                    passwordHash,

                    emailVerifiedAt: verificationRequired && !isPilotAccess ? null : new Date(),

                    role:
                      "owner",
                  },
                },

              },
            });

          if (isPilotAccess) {
            // Keep pilot marketplace records excluded from ordinary marketplace and admin analytics.
            // This maps to the existing QA account table; no schema change is needed.
            await tx.qaTestAccount.create({
              data: { runId: "uk-student-pilot", accountId: createdAccount.id },
            });
          }

          if (testerCodeHash && !isPilotAccess) {
            const accessCode = await tx.testerAccessCode.findUnique({ where: { codeHash: testerCodeHash } });
            if (!accessCode || accessCode.claimedAt || accessCode.claimedByAccountId) {
              throw new Error("TESTER_CODE_INVALID_OR_USED");
            }
            const claim = await tx.testerAccessCode.updateMany({
              where: { id: accessCode.id, claimedAt: null, claimedByAccountId: null },
              data: { claimedAt: new Date(), claimedByAccountId: createdAccount.id },
            });
            if (claim.count !== 1) throw new Error("TESTER_CODE_INVALID_OR_USED");
          }
          if (
            referrerId
          ) {
            await tx.referral.create({
              data: {
                referrerId,

                referredAccountId:
                  createdAccount.id,

                status:
                  "pending",
              },
            });
          }

          return createdAccount;
        }
        );
        break;
      } catch (error) {
        const databaseError = error as { code?: unknown; meta?: { target?: unknown } };
        const target = Array.isArray(databaseError.meta?.target)
          ? databaseError.meta.target.join(",").toLowerCase()
          : String(databaseError.meta?.target ?? "").toLowerCase();
        const isDisplayIdCollision =
          databaseError.code === "P2002" &&
          (target.includes("displayid") || target.includes("display_id"));

        if (!isDisplayIdCollision) throw error;

        displayIdCollisionCount++;
        console.warn("Signup displayId collision", {
          attempt,
          collisionCount: displayIdCollisionCount,
          maxAttempts: maxDisplayIdAttempts,
        });

        if (attempt === maxDisplayIdAttempts) {
          console.warn("Signup displayId reservation exhausted", {
            attempts: attempt,
            collisionCount: displayIdCollisionCount,
          });
          return NextResponse.json(
            { error: "Could not reserve a unique business ID. Please retry signup." },
            { status: 409 }
          );
        }
        // The failed transaction has rolled back, so retry with a new candidate.
      }
    }

    console.info("Signup displayId reservation outcome", {
      outcome: account ? "created" : "missing_account",
      attempts: displayIdAttempts,
      collisionCount: displayIdCollisionCount,
    });

    if (!account) {
      console.error("Signup account creation ended without an account", {
        attempts: displayIdAttempts,
        collisionCount: displayIdCollisionCount,
      });
      return NextResponse.json({ error: "Unable to create account. Please try again." }, { status: 500 });
    }

let verificationEmailSent = false;
if (verificationRequired && !isPilotAccess) {
  const createdUser = await prisma.user.findUnique({
    where: { email: normalizedEmail },
    select: { id: true, email: true, name: true },
  });
  if (createdUser) {
    try {
      const { token } = await createEmailVerificationToken(createdUser.id);
      await sendVerificationEmail(createdUser.email, createdUser.name, token);
      verificationEmailSent = true;
    } catch (sendError) {
      // Account and token remain available so the user can request another email.
      console.error("Signup verification email failed:", sendError);
    }
  }
}

return NextResponse.json({
  success: true,
  accountId: account.id,
  referralRecorded: Boolean(referrerId),
  testerApplicationPending: Boolean(testerCodeHash) && !isPilotAccess,
  pilotAccessEnabled: isPilotAccess,
  pilotTrialEndsAt: pilotFreeEndsAt?.toISOString() ?? null,
  emailVerificationPending: verificationRequired && !isPilotAccess,
  verificationEmailSent,
}, { status: 201 });
  } catch (error) {
    const signupError = error as { code?: unknown };
    // Do not log raw Prisma exceptions: their invocation metadata can contain
    // account fields. Collision diagnostics above intentionally contain no PII.
    console.error("Signup failed", {
      errorName: error instanceof Error ? error.name : "UnknownError",
      prismaCode: typeof signupError?.code === "string" ? signupError.code : undefined,
    });
    if (error instanceof Error && error.message === "TESTER_CODE_INVALID_OR_USED") {
      return NextResponse.json({ error: "This tester code is invalid or has already been used." }, { status: 409 });
    }

    // The preflight lookup improves the normal duplicate-email response, but
    // concurrent signups can still race the database unique constraint.
    const databaseError = error as { code?: unknown; meta?: { target?: unknown } };
    if (databaseError?.code === "P2002") {
      const target = Array.isArray(databaseError.meta?.target)
        ? databaseError.meta.target.join(",").toLowerCase()
        : String(databaseError.meta?.target ?? "").toLowerCase();
      if (target.includes("email")) {
        return NextResponse.json({ error: "An account with this email already exists." }, { status: 409 });
      }
      if (target.includes("displayid") || target.includes("display_id")) {
        return NextResponse.json({ error: "Could not reserve a unique business ID. Please retry signup." }, { status: 409 });
      }
      return NextResponse.json({ error: "A conflicting account record was created. Please retry signup." }, { status: 409 });
    }

    return NextResponse.json({ error: "Unable to create account. Please try again." }, { status: 500 });
  }
}
export const POST = withApiMetrics("/api/signup", POSTHandler);
