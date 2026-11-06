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
  const [vehicles, firstJob] = market === "weekly"
    ? await Promise.all([
        prisma.vehicle.findMany({
          // Vehicle "approved" = verificationStatus verified + verifiedAt (set by admin vehicle review).
          where: { accountId: account.id, verificationStatus: "verified", verifiedAt: { not: null } },
          select: { verifiedAt: true, insuranceValidUntil: true, motValidUntil: true },
          take: 200,
        }),
        prisma.job.findFirst({ where: { posterId: account.id }, orderBy: { createdAt: "asc" }, select: { createdAt: true } }),
      ])
    : [[], null];
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
  };
}

/** Region counts for the driver waitlist. Active driver = admitted or on a live paid driver/fleet plan; active poster = posted a job in the last 30 days. */
async function regionCounts(db: typeof prisma, region: string, country: string, now: Date) {
  const regionWhere = { operatingRegion: region, country, deletionRequestedAt: null, verificationStatus: { not: "suspended" as const } };
  const [activeDrivers, activePosters] = await Promise.all([
    db.account.count({
      where: {
        ...regionWhere,
        OR: [
          { driverAdmittedAt: { not: null } },
          { subscriptionStatus: "active", subscriptionPlanKey: { in: ["individual", "fleet"] }, subscriptionEndsAt: { gt: now } },
        ],
      },
    }),
    db.account.count({
      where: { ...regionWhere, postedJobs: { some: { createdAt: { gte: addDays(now, -ACTIVE_POSTER_DAYS) } } } },
    }),
  ]);
  return { activeDrivers, activePosters };
}

/** 1-based queue position among not-yet-admitted drivers in the region, ordered by join time. */
async function waitlistPosition(db: typeof prisma, account: LoadedAccount, joinedAt: Date) {
  const ahead = await db.account.count({
    where: {
      operatingRegion: account.operatingRegion,
      country: account.country,
      driverAdmittedAt: null,
      deletionRequestedAt: null,
      verificationStatus: { not: "suspended" },
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

/** POST entitlement: creating and editing jobs, managing bids on one's own jobs. */
export async function getPostAccess(accountId: string) {
  const pre = await preflight(accountId);
  if (!pre.ok) return { allowed: false as const, reason: pre.reason, account: pre.account, endsAt: undefined, opensAt: null };
  const { account } = pre;
  const launch = marketOf(account) === "weekly" ? await getLaunchConfig() : null;
  const facts = await gatherFacts(account);
  return shape(account, computePostEntitlement(facts, launch?.config ?? null, new Date()));
}

/**
 * DRIVE entitlement: browsing the open marketplace as a driver, bidding and accepting.
 * During the driver window this also joins/advances the regional waitlist and admits the
 * account automatically when room appears (no cron needed).
 */
export async function getDriveAccess(accountId: string) {
  const pre = await preflight(accountId);
  if (!pre.ok) return { allowed: false as const, reason: pre.reason, account: pre.account, endsAt: undefined, opensAt: null, waitlistPosition: null as number | null };
  let { account } = pre;
  const now = new Date();
  const launch = marketOf(account) === "weekly" ? await getLaunchConfig() : null;
  const config: LaunchConfig | null = launch?.config ?? null;
  const facts = await gatherFacts(account);
  let entitlement = computeDriveEntitlement(facts, config, now);

  if (entitlement.reason === "waitlisted" && config && isInDriverWindow(config, now) && account.operatingRegion) {
    const region = account.operatingRegion;
    const result = await prisma.$transaction(async (tx: any) => {
      // Serialise admissions per region so concurrent evaluations cannot over-admit.
      await tx.$executeRawUnsafe("SELECT pg_advisory_xact_lock(hashtext($1))", `driver-waitlist:${account.country}:${region}`);
      const fresh = await tx.account.findUnique({ where: { id: account.id }, select: ACCOUNT_SELECT });
      if (!fresh || fresh.operatingRegion !== region) return null;
      let joinedAt: Date = fresh.driverWaitlistedAt;
      if (!joinedAt) {
        joinedAt = now;
        await tx.account.update({ where: { id: fresh.id }, data: { driverWaitlistedAt: joinedAt } });
      }
      if (fresh.driverAdmittedAt) return { account: fresh, waitlist: null };
      const counts = await regionCounts(tx, region, fresh.country, now);
      const position = await waitlistPosition(tx, fresh, joinedAt);
      const decided = computeDriveEntitlement({ ...facts, waitlist: { position, ...counts } }, config, now);
      if (decided.admit) {
        const admitted = await tx.account.update({ where: { id: fresh.id }, data: { driverAdmittedAt: now }, select: ACCOUNT_SELECT });
        return { account: admitted, waitlist: { position, ...counts } };
      }
      return { account: fresh, waitlist: { position, ...counts } };
    });
    if (result) {
      account = result.account;
      entitlement = computeDriveEntitlement({ ...facts, driverAdmittedAt: account.driverAdmittedAt, waitlist: result.waitlist }, config, now);
    }
  }

  return { ...shape(account, entitlement), waitlistPosition: entitlement.waitlistPosition ?? null };
}

/** Combined status for the dashboard and /api/account/access: both entitlements, window state and billing. */
export async function getEntitlementStatus(accountId: string) {
  const [post, drive] = await Promise.all([getPostAccess(accountId), getDriveAccess(accountId)]);
  const account = post.account;
  const now = new Date();
  const weekly = Boolean(account && marketOf(account) === "weekly");
  const launch = weekly ? await getLaunchConfig() : null;
  const billing = account && weekly ? computeBilling(await gatherFacts(account), launch?.config ?? null, now) : null;
  return {
    post,
    drive,
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
  const post = await getPostAccess(accountId);
  if (post.allowed || !post.account) return post;
  const drive = await getDriveAccess(accountId);
  return drive.allowed ? drive : post;
}
