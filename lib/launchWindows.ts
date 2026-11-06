/*
 * Launch windows, entitlements and billing rules (EXECUTION_PLAN §3–§4, owner decisions 2026-11-06).
 *
 * PURE MODULE: no database, no clock, no environment. Every rule takes `now` and plain facts so
 * scripts/qa/entitlements-contract.mjs can test each date boundary. lib/access.ts gathers the facts.
 *
 * - Two entitlements: POST (poster plan, or driver/fleet plan) and DRIVE (driver/fleet plan only).
 * - All dates come from the LaunchConfig database row. A missing or invalid row FAILS CLOSED:
 *   no free window, no Month 0 gate, only paid access (and the staging pilot) can grant access.
 * - Billing is computed here; payment records are only ever "pending" (no provider is connected).
 */

export const DAY_MS = 24 * 60 * 60 * 1000;
export const DRIVER_PERIOD_DAYS = 7;
/** Poster -> driver: billing switches to the 7-day plan this many days after the first vehicle approval. */
export const POSTER_TO_DRIVER_SWITCH_DAYS = 7;
/** No eligible vehicle for this many days moves the account back to poster monthly billing. */
export const NO_ELIGIBLE_VEHICLE_FALLBACK_DAYS = 14;

export type LaunchConfig = {
  posterWindowStart: Date;
  posterWindowEnd: Date;
  driverWindowStart: Date;
  driverWindowEnd: Date;
  newPosterTrialDays: number;
  driverWaitlistRatio: number;
};

export type LaunchConfigRow = {
  posterWindowStart?: Date | null;
  posterWindowEnd?: Date | null;
  driverWindowStart?: Date | null;
  driverWindowEnd?: Date | null;
  newPosterTrialDays?: number | null;
  driverWaitlistRatio?: number | null;
} | null | undefined;

export type LaunchConfigCheck =
  | { status: "ok"; config: LaunchConfig }
  | { status: "missing" | "invalid"; config: null; issue: string };

const validDate = (value: unknown): value is Date => value instanceof Date && Number.isFinite(value.getTime());

/** Validate the database row. Never invents dates: anything missing or inconsistent fails closed. */
export function checkLaunchConfig(row: LaunchConfigRow): LaunchConfigCheck {
  if (!row) return { status: "missing", config: null, issue: "No LaunchConfig row exists. Free launch windows are disabled until an operator configures them." };
  const { posterWindowStart, posterWindowEnd, driverWindowStart, driverWindowEnd, newPosterTrialDays, driverWaitlistRatio } = row;
  if (!validDate(posterWindowStart) || !validDate(posterWindowEnd) || !validDate(driverWindowStart) || !validDate(driverWindowEnd)) {
    return { status: "invalid", config: null, issue: "Every launch window date must be set." };
  }
  if (posterWindowEnd <= posterWindowStart) return { status: "invalid", config: null, issue: "posterWindowEnd must be after posterWindowStart." };
  if (driverWindowEnd <= driverWindowStart) return { status: "invalid", config: null, issue: "driverWindowEnd must be after driverWindowStart." };
  if (driverWindowStart < posterWindowStart) return { status: "invalid", config: null, issue: "driverWindowStart cannot be before posterWindowStart (Month 0 blocks all bidding and accepting)." };
  if (driverWindowEnd > posterWindowEnd) return { status: "invalid", config: null, issue: "driverWindowEnd cannot be after posterWindowEnd." };
  if (!Number.isInteger(newPosterTrialDays) || (newPosterTrialDays as number) < 0 || (newPosterTrialDays as number) > 366) {
    return { status: "invalid", config: null, issue: "newPosterTrialDays must be a whole number from 0 to 366." };
  }
  if (typeof driverWaitlistRatio !== "number" || !Number.isFinite(driverWaitlistRatio) || driverWaitlistRatio < 0) {
    return { status: "invalid", config: null, issue: "driverWaitlistRatio must be a non-negative number." };
  }
  return {
    status: "ok",
    config: { posterWindowStart, posterWindowEnd, driverWindowStart, driverWindowEnd, newPosterTrialDays: newPosterTrialDays as number, driverWaitlistRatio },
  };
}

export type LaunchPhase = "unconfigured" | "month_0" | "poster_window" | "after_poster_window";

export function launchPhase(config: LaunchConfig | null, now: Date): LaunchPhase {
  if (!config) return "unconfigured";
  if (now < config.posterWindowStart) return "month_0";
  if (now < config.posterWindowEnd) return "poster_window";
  return "after_poster_window";
}

export function isInDriverWindow(config: LaunchConfig | null, now: Date) {
  return Boolean(config && now >= config.driverWindowStart && now < config.driverWindowEnd);
}

export function addDays(date: Date, days: number) {
  return new Date(date.getTime() + days * DAY_MS);
}

/** Calendar-month addition in UTC, clamped to the last day of the target month. */
export function addMonths(date: Date, months: number) {
  const result = new Date(date);
  const day = result.getUTCDate();
  result.setUTCDate(1);
  result.setUTCMonth(result.getUTCMonth() + months);
  const lastDay = new Date(Date.UTC(result.getUTCFullYear(), result.getUTCMonth() + 1, 0)).getUTCDate();
  result.setUTCDate(Math.min(day, lastDay));
  return result;
}

const maxDate = (a: Date, b: Date) => (a >= b ? a : b);
const minDate = (a: Date, b: Date) => (a <= b ? a : b);

/* ------------------------------------------------------------------ */
/* Operating region (driver waitlist)                                  */
/* ------------------------------------------------------------------ */

/**
 * Normalise an operating region. GB: a UK postcode area (1–2 letters, e.g. "LS", "M", "SW").
 * Other non-India markets: a short local region code. India does not use regions.
 * Returns null for empty input and "invalid" for a value that does not match.
 */
export function normalizeOperatingRegion(country: string, value: unknown): string | null | "invalid" {
  if (value === undefined || value === null) return null;
  if (typeof value !== "string") return "invalid";
  const trimmed = value.trim().toUpperCase();
  if (!trimmed) return null;
  if (country === "IN") return "invalid";
  if (country === "GB") return /^[A-Z]{1,2}$/.test(trimmed) ? trimmed : "invalid";
  return /^[A-Z0-9]{1,10}$/.test(trimmed) ? trimmed : "invalid";
}

/**
 * Driver waitlist (§4). A new driver/fleet may drive free only while active drivers in the region
 * stay <= ratio x active posters in the region, counting the newly admitted driver. Admission is
 * first-come-first-served: position N is admitted only when there is room for N more drivers.
 */
export function waitlistRoom(activeDriversInRegion: number, activePostersInRegion: number, ratio: number) {
  // Small epsilon so 1.0 x 3 posters is exactly 3, never 2.9999.
  return Math.max(0, Math.floor(ratio * activePostersInRegion + 1e-9) - activeDriversInRegion);
}

export function waitlistDecision(position: number, activeDriversInRegion: number, activePostersInRegion: number, ratio: number) {
  const room = waitlistRoom(activeDriversInRegion, activePostersInRegion, ratio);
  return { admit: position >= 1 && position <= room, room, position };
}

/* ------------------------------------------------------------------ */
/* Facts and entitlements                                              */
/* ------------------------------------------------------------------ */

export type DrivePlanKey = "individual" | "fleet";
export type PlanKey = "poster" | DrivePlanKey;

export type EntitlementFacts = {
  /** india = free after phone OTP; weekly = priced non-India market; other = market without configured pricing. */
  market: "india" | "weekly" | "other";
  phoneVerified: boolean;
  /** verificationStatus === "verified" (or an approved tester, as before). */
  verified: boolean;
  /**
   * Staging UK student pilot / admin-approved tester: 90-day promotional access stored on
   * Account.freeEndsAt for isTester + promotionParticipant accounts. Preserved unchanged.
   */
  pilotFreeEndsAt: Date | null;
  /** Account plan type chosen at signup (vehicle count); prices the driver/fleet plan. */
  drivePlanKey: DrivePlanKey;
  /** First job posted: the first chargeable POST use (starts the poster plan). */
  firstJobPostedAt: Date | null;
  /** Earliest Vehicle.verifiedAt among verified vehicles: the first chargeable DRIVE use. */
  firstVehicleApprovedAt: Date | null;
  /** Latest moment any verified vehicle is still eligible (insurance and any required MOT current). Null when none is approved. */
  vehicleEligibleUntil: Date | null;
  operatingRegion: string | null;
  /** Persisted admission to free driving during the driver window. */
  driverAdmittedAt: Date | null;
  /** Waitlist position (1-based) and current regional counts; null when not on the waitlist. */
  waitlist: { position: number; activeDrivers: number; activePosters: number } | null;
  /** Confirmed (provider-settled) paid access; null when none. */
  paid: { planKey: string | null; endsAt: Date } | null;
  /** Driver -> poster switch request; effective at the end of the current 7-day period. */
  switchToPosterRequestedAt: Date | null;
};

export type EntitlementReason =
  | "india_free" | "verification_required" | "non_weekly_market" | "pilot"
  | "month_0" | "poster_window" | "new_poster_trial" | "paid"
  | "driver_window" | "waitlisted" | "region_required" | "no_approved_vehicle"
  | "no_eligible_vehicle" | "driver_window_not_open" | "switch_period" | "driver_plan_ended"
  | "access_expired";

export type Entitlement = {
  allowed: boolean;
  reason: EntitlementReason;
  /** When this grant ends (null = no fixed end). */
  endsAt: Date | null;
  /** Month 0: when posting/driving opens. */
  opensAt?: Date | null;
};

const deny = (reason: EntitlementReason, extra: Partial<Entitlement> = {}): Entitlement => ({ allowed: false, reason, endsAt: null, ...extra });
const grant = (reason: EntitlementReason, endsAt: Date | null): Entitlement => ({ allowed: true, reason, endsAt });

/** The grant that lasts longest wins (null endsAt = open-ended). */
function best(grants: Entitlement[]): Entitlement | null {
  const allowed = grants.filter((entry) => entry.allowed);
  if (allowed.length === 0) return null;
  return allowed.reduce((a, b) => {
    if (a.endsAt === null) return a;
    if (b.endsAt === null) return b;
    return b.endsAt > a.endsAt ? b : a;
  });
}

/** Poster free period: in-window joiners are free until posterWindowEnd; a new poster after the window gets newPosterTrialDays from first post. */
export function posterFreeUntil(config: LaunchConfig | null, firstJobPostedAt: Date | null, now: Date): Date | null {
  if (!config) return null;
  if (now < config.posterWindowStart) return null;
  if (firstJobPostedAt && firstJobPostedAt < config.posterWindowEnd) return config.posterWindowEnd;
  if (now < config.posterWindowEnd && !firstJobPostedAt) return config.posterWindowEnd;
  const trialStart = firstJobPostedAt ?? now;
  return addDays(trialStart, config.newPosterTrialDays);
}

/** The driver/fleet plan ends at the 14-day no-eligible-vehicle fallback or at an accepted switch back to poster. */
export function driverPlanEndsAt(facts: EntitlementFacts, config: LaunchConfig | null): Date | null {
  if (!facts.firstVehicleApprovedAt) return null;
  const eligibleUntil = facts.vehicleEligibleUntil ?? facts.firstVehicleApprovedAt;
  const fallbackAt = addDays(eligibleUntil, NO_ELIGIBLE_VEHICLE_FALLBACK_DAYS);
  if (!facts.switchToPosterRequestedAt) return fallbackAt;
  const switchAt = driverPeriodEndAfter(driverBillingAnchor(facts, config), facts.switchToPosterRequestedAt);
  return minDate(fallbackAt, switchAt);
}

export function computeDriveEntitlement(facts: EntitlementFacts, config: LaunchConfig | null, now: Date): Entitlement & { admit?: boolean; waitlistPosition?: number } {
  if (facts.market === "india") return facts.phoneVerified ? grant("india_free", null) : deny("verification_required");
  if (facts.market === "other") return grant("non_weekly_market", null);
  if (facts.pilotFreeEndsAt && facts.pilotFreeEndsAt > now) return grant("pilot", facts.pilotFreeEndsAt);
  if (!facts.verified) return deny("verification_required");
  if (config && now < config.posterWindowStart) return deny("month_0", { opensAt: config.posterWindowStart });
  if (!facts.firstVehicleApprovedAt) return deny("no_approved_vehicle");
  const planEnd = driverPlanEndsAt(facts, config);
  if (planEnd && now >= planEnd) return deny("driver_plan_ended");
  if (!facts.vehicleEligibleUntil || facts.vehicleEligibleUntil <= now) return deny("no_eligible_vehicle");

  const grants: Entitlement[] = [];
  if (facts.paid && facts.paid.endsAt > now && (facts.paid.planKey === "individual" || facts.paid.planKey === "fleet")) {
    grants.push(grant("paid", facts.paid.endsAt));
  }
  // Poster -> driver: jobs can be taken as soon as a vehicle is approved; for the first 7 days the
  // account stays on its poster entitlement before billing switches to 7-day. Inside the driver
  // window the waitlist governs instead, so this cannot be used to jump the regional queue.
  const switchAt = driverSwitchAt(facts);
  if (switchAt && switchAt > facts.firstVehicleApprovedAt && now < switchAt && !isInDriverWindow(config, now)) {
    const posterOnly = computePostEntitlement(facts, config, now);
    if (posterOnly.allowed) grants.push(grant("switch_period", posterOnly.endsAt && posterOnly.endsAt < switchAt ? posterOnly.endsAt : switchAt));
  }
  let waitlistOutcome: Entitlement | null = null;
  let admit = false;
  if (config && isInDriverWindow(config, now)) {
    if (facts.driverAdmittedAt) {
      grants.push(grant("driver_window", config.driverWindowEnd));
    } else if (!facts.operatingRegion) {
      waitlistOutcome = deny("region_required");
    } else if (facts.waitlist) {
      const decision = waitlistDecision(facts.waitlist.position, facts.waitlist.activeDrivers, facts.waitlist.activePosters, config.driverWaitlistRatio);
      if (decision.admit) {
        admit = true;
        grants.push(grant("driver_window", config.driverWindowEnd));
      } else {
        waitlistOutcome = deny("waitlisted");
      }
    } else {
      waitlistOutcome = deny("waitlisted");
    }
  } else if (config && now < config.driverWindowStart && !facts.paid) {
    waitlistOutcome = deny("driver_window_not_open", { opensAt: config.driverWindowStart });
  }

  const chosen = best(grants);
  if (chosen) {
    const endsAt = planEnd && (chosen.endsAt === null || planEnd < chosen.endsAt) ? planEnd : chosen.endsAt;
    return { ...chosen, endsAt, admit: admit || undefined };
  }
  if (waitlistOutcome) return { ...waitlistOutcome, waitlistPosition: facts.waitlist?.position };
  return deny("access_expired");
}

export function computePostEntitlement(facts: EntitlementFacts, config: LaunchConfig | null, now: Date): Entitlement {
  if (facts.market === "india") return facts.phoneVerified ? grant("india_free", null) : deny("verification_required");
  if (facts.market === "other") return grant("non_weekly_market", null);
  if (facts.pilotFreeEndsAt && facts.pilotFreeEndsAt > now) return grant("pilot", facts.pilotFreeEndsAt);
  if (!facts.verified) return deny("verification_required");
  if (config && now < config.posterWindowStart) return deny("month_0", { opensAt: config.posterWindowStart });

  const grants: Entitlement[] = [];
  if (config) {
    const freeUntil = posterFreeUntil(config, facts.firstJobPostedAt, now);
    if (freeUntil && now < freeUntil) {
      grants.push(grant(now < config.posterWindowEnd ? "poster_window" : "new_poster_trial", freeUntil));
    }
  }
  // Any confirmed plan includes posting (driver/fleet plans include posting; expired vehicle
  // documents lock driving only).
  if (facts.paid && facts.paid.endsAt > now) grants.push(grant("paid", facts.paid.endsAt));
  return best(grants) ?? deny("access_expired");
}

/* ------------------------------------------------------------------ */
/* Billing (§3)                                                        */
/* ------------------------------------------------------------------ */

/** Billing for the poster plan starts at first post, after any free period. Null = never used, never charged. */
export function posterChargeableFrom(config: LaunchConfig | null, firstJobPostedAt: Date | null): Date | null {
  if (!firstJobPostedAt) return null;
  if (!config) return firstJobPostedAt;
  const freeUntil = firstJobPostedAt < config.posterWindowEnd ? config.posterWindowEnd : addDays(firstJobPostedAt, config.newPosterTrialDays);
  return maxDate(firstJobPostedAt, freeUntil);
}

/*
 * HOOK (verification fees, PR #176): a poster upgrading to driver pays the 3.50 driver/first-vehicle
 * verification fee (lib/verificationFees.ts recordDriverUpgradeFee). Fees are not implemented here;
 * wire that call where the first vehicle is submitted for review once #176 lands.
 */
/** When billing switches to (or starts on) the 7-day plan. */
export function driverSwitchAt(facts: Pick<EntitlementFacts, "firstJobPostedAt" | "firstVehicleApprovedAt">): Date | null {
  if (!facts.firstVehicleApprovedAt) return null;
  const wasPoster = Boolean(facts.firstJobPostedAt && facts.firstJobPostedAt <= facts.firstVehicleApprovedAt);
  return wasPoster ? addDays(facts.firstVehicleApprovedAt, POSTER_TO_DRIVER_SWITCH_DAYS) : facts.firstVehicleApprovedAt;
}

/** Start of 7-day driver billing: the switch date, pushed to driverWindowEnd for drivers admitted to the free window. */
export function driverBillingAnchor(facts: EntitlementFacts, config: LaunchConfig | null): Date | null {
  const switchAt = driverSwitchAt(facts);
  if (!switchAt) return null;
  if (config && facts.driverAdmittedAt && facts.driverAdmittedAt < config.driverWindowEnd) return maxDate(switchAt, config.driverWindowEnd);
  return switchAt;
}

/** End of the 7-day period containing `at` (period boundaries are anchor + k x 7 days). Before the anchor nothing is billed, so the switch is immediate. */
export function driverPeriodEndAfter(anchor: Date | null, at: Date): Date {
  if (!anchor || at <= anchor) return at;
  const period = DRIVER_PERIOD_DAYS * DAY_MS;
  const elapsed = at.getTime() - anchor.getTime();
  return new Date(anchor.getTime() + Math.ceil(elapsed / period) * period);
}

/** Monthly period containing `at`, anchored on the poster billing start. */
export function posterPeriodContaining(anchor: Date, at: Date) {
  let index = 0;
  while (addMonths(anchor, index + 1) <= at) index += 1;
  return { start: addMonths(anchor, index), end: addMonths(anchor, index + 1) };
}

/**
 * Unused days of the poster month credited to the first 7-day payment when billing switches
 * from poster to driver. Zero when the poster plan was still free (nothing was paid).
 */
export function posterCreditOnSwitch(config: LaunchConfig | null, facts: Pick<EntitlementFacts, "firstJobPostedAt" | "firstVehicleApprovedAt">) {
  const switchAt = driverSwitchAt(facts);
  const posterAnchor = posterChargeableFrom(config, facts.firstJobPostedAt);
  if (!switchAt || !posterAnchor || switchAt <= posterAnchor || facts.firstJobPostedAt! > facts.firstVehicleApprovedAt!) {
    return { creditDays: 0, periodDays: 0 };
  }
  const period = posterPeriodContaining(posterAnchor, switchAt);
  const periodDays = Math.round((period.end.getTime() - period.start.getTime()) / DAY_MS);
  const creditDays = Math.floor((period.end.getTime() - switchAt.getTime()) / DAY_MS);
  return { creditDays, periodDays };
}

/** Credit in minor units: monthly price x unused days / days in that month, rounded to the nearest minor unit. */
export function creditMinorUnits(posterMonthlyMinorUnits: number, creditDays: number, periodDays: number) {
  if (creditDays <= 0 || periodDays <= 0) return 0;
  return Math.round((posterMonthlyMinorUnits * creditDays) / periodDays);
}

export type BillingSummary = {
  /** Plan the account is on now (one subscription per account). */
  plan: PlanKey | "none";
  period: "month" | "7 days" | null;
  /** First chargeable moment for the current plan; null = nothing chargeable yet. */
  chargeableFrom: Date | null;
  /** Current billing period when chargeable now; a pending payment record belongs to it. */
  currentPeriod: { start: Date; end: Date } | null;
  /** Next billing date (start of the next period, or the first chargeable date). */
  nextBillingAt: Date | null;
  /** Poster -> driver switch date and credit, when applicable. */
  switchToDriverAt: Date | null;
  creditDays: number;
  creditPeriodDays: number;
  /** Driver -> poster (requested switch or 14-day fallback). */
  driverPlanEndsAt: Date | null;
};

export function computeBilling(facts: EntitlementFacts, config: LaunchConfig | null, now: Date): BillingSummary {
  const none: BillingSummary = { plan: "none", period: null, chargeableFrom: null, currentPeriod: null, nextBillingAt: null, switchToDriverAt: null, creditDays: 0, creditPeriodDays: 0, driverPlanEndsAt: null };
  if (facts.market !== "weekly") return none;
  if (facts.pilotFreeEndsAt && facts.pilotFreeEndsAt > now) return none;

  const driverEnd = driverPlanEndsAt(facts, config);
  const onDriverPlan = Boolean(facts.firstVehicleApprovedAt && facts.firstVehicleApprovedAt <= now && (!driverEnd || now < driverEnd));
  const switchToDriverAt = driverSwitchAt(facts);
  const credit = posterCreditOnSwitch(config, facts);

  // Driver/fleet plan. During the first 7 days after approval a poster stays on monthly billing.
  if (onDriverPlan && switchToDriverAt && now >= switchToDriverAt) {
    const anchor = driverBillingAnchor(facts, config)!;
    const period = DRIVER_PERIOD_DAYS * DAY_MS;
    const currentPeriod = now >= anchor
      ? (() => { const index = Math.floor((now.getTime() - anchor.getTime()) / period); const start = new Date(anchor.getTime() + index * period); return { start, end: new Date(start.getTime() + period) }; })()
      : null;
    return {
      plan: facts.drivePlanKey, period: "7 days", chargeableFrom: anchor, currentPeriod,
      nextBillingAt: currentPeriod ? currentPeriod.end : anchor,
      switchToDriverAt, creditDays: credit.creditDays, creditPeriodDays: credit.periodDays, driverPlanEndsAt: driverEnd,
    };
  }

  // Poster monthly plan: from first post, or resumed when the driver plan ended.
  const posterAnchor = posterChargeableFrom(config, facts.firstJobPostedAt);
  const resumedAt = driverEnd && now >= driverEnd ? driverEnd : null;
  const anchor = posterAnchor && resumedAt ? maxDate(posterAnchor, resumedAt) : posterAnchor ?? resumedAt;
  const usedPosting = Boolean(facts.firstJobPostedAt) || (onDriverPlan && switchToDriverAt !== null && now < switchToDriverAt) || Boolean(resumedAt);
  if (!anchor || !usedPosting) {
    return { ...none, switchToDriverAt, driverPlanEndsAt: driverEnd, plan: onDriverPlan ? "poster" : "none", period: onDriverPlan ? "month" : null };
  }
  const currentPeriod = now >= anchor ? posterPeriodContaining(anchor, now) : null;
  return {
    plan: "poster", period: "month", chargeableFrom: anchor, currentPeriod,
    nextBillingAt: currentPeriod ? currentPeriod.end : anchor,
    switchToDriverAt, creditDays: credit.creditDays, creditPeriodDays: credit.periodDays, driverPlanEndsAt: driverEnd,
  };
}
