import { prisma } from "@/lib/prisma";
import { isWeeklyPricingEligible } from "@/lib/pricing";
import { getSuspendedAccountAccess } from "@/lib/accessPolicy";
import { getLaunchConfig } from "@/lib/launchConfig";
import { getLocalisationProfile } from "@/lib/localisation";
import {
  addDays,
  computeBilling,
  computeDriveEntitlement,
  computePostEntitlement,
  isInDriverWindow,
  type EntitlementFacts,
  type LaunchConfig,
  type LaunchConfigCheck,
} from "@/lib/launchWindows";

/*
 * Separate entitlements (EXECUTION_PLAN §3): POST (create/edit jobs, manage own jobs' bids) and
 * DRIVE (browse the open marketplace as a driver, bid, accept). Rules live in lib/launchWindows.ts.
 */

const ACCOUNT_SELECT = {
  id: true,
  country: true,
  currency: true,
  verificationStatus: true,
  phoneVerifiedAt: true,
  isTester: true,
  promotionParticipant: true,
  trialStartedAt: true,
  trialEndsAt: true,
  freeEndsAt: true,
  subscriptionStatus: true,
  subscriptionEndsAt: true,
  subscriptionPlanKey: true,
  planType: true,
  fleetVehicleCount: true,
  deletionRequestedAt: true,
  operatingRegion: true,
  driverWaitlistedAt: true,
  driverAdmittedAt: true,
  switchToPosterRequestedAt: true,
} as const;

/** Days a driver counts as an "active poster" in its region after posting a job. */
const ACTIVE_POSTER_DAYS = 30;

async function loadAccount(accountId: string) {
  return prisma.account.findUnique({ where: { id: accountId }, select: ACCOUNT_SELECT });
}
type LoadedAccount = NonNullable<Awaited<ReturnType<typeof loadAccount>>>;

function marketOf(account: LoadedAccount): EntitlementFacts["market"] {
  if (account.country === "IN" && account.currency === "INR") return "india";
  return isWeeklyPricingEligible(account) ? "weekly" : "other";
}

/** Latest instant any approved vehicle is still eligible (insurance and any required MOT valid through that calendar day). */
function vehicleEligibility(
  account: LoadedAccount,
  vehicles: Array<{ verifiedAt: Date | null; insuranceValidUntil: Date | null; motValidUntil: Date | null }>,
) {
  const inspectionRequired = Boolean(getLocalisationProfile({ country: account.country, currency: account.currency })?.inspectionRequiredAtCountryLevel);
  let firstApprovedAt: Date | null = null;
  let eligibleUntil: Date | null = null;
  for (const vehicle of vehicles) {
    if (!vehicle.verifiedAt) continue;
    if (!firstApprovedAt || vehicle.verifiedAt < firstApprovedAt) firstApprovedAt = vehicle.verifiedAt;
    if (!vehicle.insuranceValidUntil) continue;
    let until = vehicle.insuranceValidUntil;
    if (inspectionRequired) {
      if (!vehicle.motValidUntil) continue;
      if (vehicle.motValidUntil < until) until = vehicle.motValidUntil;
    }
    const endOfDay = addDays(until, 1);
    if (!eligibleUntil || endOfDay > eligibleUntil) eligibleUntil = endOfDay;
  }
  return { firstApprovedAt, eligibleUntil };
}

async function gatherFacts(account: LoadedAccount): Promise<EntitlementFacts> {
  const market = marketOf(account);
  const [vehicles, firstJob, posterPayments] = market === "weekly"
    ? await Promise.all([
        prisma.vehicle.findMany({
          // Vehicle "approved" = verificationStatus verified + verifiedAt (set by admin vehicle review).
          where: { accountId: account.id, verificationStatus: "verified", verifiedAt: { not: null } },
          select: { verifiedAt: true, insuranceValidUntil: true, motValidUntil: true },
          take: 200,
        }),
        prisma.job.findFirst({ where: { posterId: account.id }, orderBy: { createdAt: "asc" }, select: { createdAt: true } }),
        // Only confirmed poster payments earn a poster->driver switch credit.
        prisma.subscriptionPayment.findMany({
          where: { accountId: account.id, planKey: "poster", status: "paid", accessStartedAt: { not: null }, accessEndsAt: { not: null } },
          select: { accessStartedAt: true, accessEndsAt: true },
          orderBy: { accessEndsAt: "desc" },
          take: 24,
        }),
      ])
    : [[], null, []];
  const { firstApprovedAt, eligibleUntil } = vehicleEligibility(account, vehicles);
  return {
    market,
    phoneVerified: Boolean(account.phoneVerifiedAt),
    verified: account.verificationStatus === "verified" || account.isTester,
    // Staging UK student pilot and admin-approved testers keep their 90-day promotional access.
    pilotFreeEndsAt: account.isTester && account.promotionParticipant ? account.freeEndsAt : null,
    drivePlanKey: account.planType === "fleet" ? "fleet" : "individual",
    firstJobPostedAt: firstJob?.createdAt ?? null,
    firstVehicleApprovedAt: firstApprovedAt,
    vehicleEligibleUntil: eligibleUntil,
    operatingRegion: account.operatingRegion,
    driverAdmittedAt: account.driverAdmittedAt,
    waitlist: null,
    paid: account.subscriptionStatus === "active" && account.subscriptionEndsAt
      ? { planKey: account.subscriptionPlanKey, endsAt: account.subscriptionEndsAt }
      : null,
    switchToPosterRequestedAt: account.switchToPosterRequestedAt,
    paidPosterPeriods: (posterPayments as Array<{ accessStartedAt: Date; accessEndsAt: Date }>).map((payment) => ({ start: payment.accessStartedAt, end: payment.accessEndsAt })),
  };
}

/**
 * Accounts that may hold a waitlist place or count as an active driver in a region: not deleted,
 * person-verified (so not suspended), and with at least one approved vehicle whose insurance is
 * current. Stale entries (lapsed documents, unverified, deleted, suspended) never block admission.
 * Insurance is checked at day granularity; a required MOT is enforced again at evaluation time.
 */
function waitlistEligibleWhere(region: string, country: string, now: Date) {
  const today = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
  return {
    operatingRegion: region,
    country,
    deletionRequestedAt: null,
    verificationStatus: "verified" as const,
    vehicles: { some: { verificationStatus: "verified" as const, verifiedAt: { not: null }, insuranceValidUntil: { gte: today } } },
  };
}

/** Region counts for the driver waitlist. Active driver = eligible and admitted (or on a live paid driver/fleet plan); active poster = posted a job in the last 30 days. */
async function regionCounts(db: typeof prisma, region: string, country: string, now: Date) {
  const [activeDrivers, activePosters] = await Promise.all([
    db.account.count({
      where: {
        ...waitlistEligibleWhere(region, country, now),
        OR: [
          { driverAdmittedAt: { not: null } },
          { subscriptionStatus: "active", subscriptionPlanKey: { in: ["individual", "fleet"] }, subscriptionEndsAt: { gt: now } },
        ],
      },
    }),
    db.account.count({
      where: {
        operatingRegion: region,
        country,
        deletionRequestedAt: null,
        verificationStatus: { not: "suspended" as const },
        postedJobs: { some: { createdAt: { gte: addDays(now, -ACTIVE_POSTER_DAYS) } } },
      },
    }),
  ]);
  return { activeDrivers, activePosters };
}

/** 1-based queue position among eligible, not-yet-admitted drivers in the region, ordered by join time. */
async function waitlistPosition(db: typeof prisma, account: LoadedAccount, joinedAt: Date, now: Date) {
  const ahead = await db.account.count({
    where: {
      ...waitlistEligibleWhere(account.operatingRegion as string, account.country, now),
      driverAdmittedAt: null,
      OR: [{ driverWaitlistedAt: { lt: joinedAt } }, { driverWaitlistedAt: joinedAt, id: { lt: account.id } }],
    },
  });
  return ahead + 1;
}

type Preflight =
  | { ok: true; account: LoadedAccount }
  | { ok: false; allowed: false; reason: "account_not_found" | "account_deletion_requested" | "account_suspended"; account: LoadedAccount | null };

async function preflight(accountId: string): Promise<Preflight> {
  const account = await loadAccount(accountId);
  if (!account) return { ok: false, allowed: false, reason: "account_not_found", account: null };
  if (account.deletionRequestedAt) return { ok: false, allowed: false, reason: "account_deletion_requested", account };
  // Suspension is a hard account-wide denial. It must be checked before any
  // market-specific phone, tester, launch-window, or subscription exemption.
  const suspensionAccess = getSuspendedAccountAccess(account);
  if (suspensionAccess) return { ok: false, ...suspensionAccess };
  return { ok: true, account };
}

function shape(account: LoadedAccount, entitlement: { allowed: boolean; reason: string; endsAt: Date | null; opensAt?: Date | null }) {
  return {
    allowed: entitlement.allowed,
    reason: entitlement.reason,
    account,
    endsAt: entitlement.endsAt ?? undefined,
    opensAt: entitlement.opensAt ?? null,
  };
}

/** One account load, one launch-config read and one facts query per entitlement evaluation. */
type Context = { account: LoadedAccount; launch: LaunchConfigCheck | null; config: LaunchConfig | null; facts: EntitlementFacts; now: Date };

async function loadContext(account: LoadedAccount): Promise<Context> {
  const [launch, facts] = await Promise.all([
    marketOf(account) === "weekly" ? getLaunchConfig() : Promise.resolve(null),
    gatherFacts(account),
  ]);
  return { account, launch, config: launch?.config ?? null, facts, now: new Date() };
}

function postFrom(ctx: Context) {
  return shape(ctx.account, computePostEntitlement(ctx.facts, ctx.config, ctx.now));
}

/**
 * DRIVE with the regional waitlist. The database is written only when the account is actually
 * waitlisted in the driver window with a region (no write for any other outcome), and both
 * writes are conditional and idempotent: joining sets driverWaitlistedAt only while it is null,
 * admission sets driverAdmittedAt only while it is null. Repeating the call never changes the
 * queue order or admits twice. A write on evaluation is kept deliberately: §4 requires automatic
 * admission "checked on access evaluation — no cron", and queue order needs a persisted join time.
 */
async function driveFrom(ctx: Context) {
  let { account, facts } = ctx;
  const { config, now } = ctx;
  let entitlement = computeDriveEntitlement(facts, config, now);

  if (entitlement.reason === "waitlisted" && config && isInDriverWindow(config, now) && account.operatingRegion) {
    const region = account.operatingRegion;
    const result = await prisma.$transaction(async (tx: any) => {
      // Serialise admissions per region so concurrent evaluations cannot over-admit.
      await tx.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtext($1))", `driver-waitlist:${account.country}:${region}`);
      await tx.account.updateMany({ where: { id: account.id, operatingRegion: region, driverWaitlistedAt: null }, data: { driverWaitlistedAt: now } });
      const fresh = await tx.account.findUnique({ where: { id: account.id }, select: ACCOUNT_SELECT });
      if (!fresh || fresh.operatingRegion !== region || !fresh.driverWaitlistedAt) return null;
      if (fresh.driverAdmittedAt) return { account: fresh, waitlist: null };
      const counts = await regionCounts(tx, region, fresh.country, now);
      const position = await waitlistPosition(tx, fresh, fresh.driverWaitlistedAt, now);
      const decided = computeDriveEntitlement({ ...facts, waitlist: { position, ...counts } }, config, now);
      if (decided.admit) {
        await tx.account.updateMany({ where: { id: fresh.id, driverAdmittedAt: null }, data: { driverAdmittedAt: now } });
        const admitted = await tx.account.findUnique({ where: { id: fresh.id }, select: ACCOUNT_SELECT });
        return { account: admitted ?? fresh, waitlist: { position, ...counts } };
      }
      return { account: fresh, waitlist: { position, ...counts } };
    });
    if (result) {
      account = result.account;
      facts = { ...facts, driverAdmittedAt: account.driverAdmittedAt, waitlist: result.waitlist };
      entitlement = computeDriveEntitlement(facts, config, now);
    }
  }

  return { result: { ...shape(account, entitlement), waitlistPosition: entitlement.waitlistPosition ?? null }, facts };
}

/** POST entitlement: creating and editing jobs, managing bids on one's own jobs. */
export async function getPostAccess(accountId: string) {
  const pre = await preflight(accountId);
  if (!pre.ok) return { allowed: false as const, reason: pre.reason, account: pre.account, endsAt: undefined, opensAt: null };
  return postFrom(await loadContext(pre.account));
}

/**
 * DRIVE entitlement: browsing the open marketplace as a driver, bidding and accepting.
 * During the driver window this also joins/advances the regional waitlist and admits the
 * account automatically when room appears (no cron needed).
 */
export async function getDriveAccess(accountId: string) {
  const pre = await preflight(accountId);
  if (!pre.ok) return { allowed: false as const, reason: pre.reason, account: pre.account, endsAt: undefined, opensAt: null, waitlistPosition: null as number | null };
  return (await driveFrom(await loadContext(pre.account))).result;
}

/** Combined status for the dashboard and /api/account/access: both entitlements, window state and billing, from one context. */
export async function getEntitlementStatus(accountId: string) {
  const pre = await preflight(accountId);
  if (!pre.ok) {
    const denied = { allowed: false as const, reason: pre.reason, account: pre.account, endsAt: undefined, opensAt: null };
    return { post: denied, drive: { ...denied, waitlistPosition: null as number | null }, launch: null, billing: null };
  }
  const ctx = await loadContext(pre.account);
  const drive = await driveFrom(ctx);
  const post = postFrom({ ...ctx, account: drive.result.account, facts: drive.facts });
  const launch = ctx.launch;
  const billing = marketOf(ctx.account) === "weekly" ? computeBilling(drive.facts, ctx.config, ctx.now) : null;
  return {
    post,
    drive: drive.result,
    launch: launch
      ? {
          configured: launch.status === "ok",
          issue: launch.status === "ok" ? null : launch.issue,
          posterWindowStart: launch.config?.posterWindowStart ?? null,
          posterWindowEnd: launch.config?.posterWindowEnd ?? null,
          driverWindowStart: launch.config?.driverWindowStart ?? null,
          driverWindowEnd: launch.config?.driverWindowEnd ?? null,
        }
      : null,
    billing,
  };
}

/**
 * Compatibility entry point for callers that need "any marketplace access" (account access API,
 * dashboard). Job actions must call getPostAccess or getDriveAccess instead.
 */
export async function getAccountAccess(accountId: string) {
  const pre = await preflight(accountId);
  if (!pre.ok) return { allowed: false as const, reason: pre.reason, account: pre.account, endsAt: undefined, opensAt: null };
  const ctx = await loadContext(pre.account);
  const post = postFrom(ctx);
  if (post.allowed) return post;
  const drive = (await driveFrom(ctx)).result;
  return drive.allowed ? drive : post;
}
