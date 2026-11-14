import { getReminderSnapshot } from "@/lib/access";
import { marketTimeZone } from "@/lib/market";
import { daysUntilExpiryDate, daysUntilInstant, documentReminderOffset, expiryWording, freePeriodEndingBody, planRenewalBody } from "@/lib/reminderDates";
import { notify } from "@/lib/notify";
import { subscriptionCheckoutConnected } from "@/lib/paymentProvider";
import { getPaidPriceMinorUnits } from "@/lib/subscription";
import { symbolFor } from "@/lib/currency";
import { minorUnitsToMajorUnits } from "@/lib/currencyMinorUnits";

const DAY_MS = 24 * 60 * 60 * 1000;
const ACCOUNT_PAGE = 200;
const MAX_ACCOUNT_PAGES = 100;

type SchedDb = any;
export type ScheduledRunSummary = { vehicleReminders: number; correctionReminders: number; planReminders: number };

const addDay = (date: Date, days: number) => new Date(date.getTime() + days * DAY_MS);

async function runVehicleExpiry(db: SchedDb, now: Date): Promise<number> {
  // Date-only expiries: a window of a few days either side of today covers every market timezone.
  const from = addDay(now, -2);
  const to = addDay(now, 9);
  const vehicles = await db.vehicle.findMany({
    where: {
      account: { deletionRequestedAt: null },
      OR: [{ insuranceValidUntil: { gte: from, lte: to } }, { motValidUntil: { gte: from, lte: to } }],
    },
    select: { id: true, accountId: true, regPlate: true, insuranceValidUntil: true, motValidUntil: true, account: { select: { country: true, currency: true } } },
    take: 5000,
  });
  let count = 0;
  for (const vehicle of vehicles) {
    const tz = marketTimeZone(vehicle.account);
    const motLabel = vehicle.account.country === "GB" ? "MOT" : "Inspection certificate";
    for (const [kind, label, expiry] of [["insurance", "Insurance", vehicle.insuranceValidUntil], ["inspection", motLabel, vehicle.motValidUntil]] as const) {
      if (!expiry) continue;
      const offset = documentReminderOffset(daysUntilExpiryDate(expiry, now, tz));
      if (offset === null) continue;
      const wording = expiryWording(label, vehicle.regPlate, offset);
      const created = await notify(db, {
        accountId: vehicle.accountId,
        type: `vehicle_${kind}_expiry`,
        ...wording,
        eventKey: `vehicle-${kind}-expiry:${vehicle.id}:${expiry.toISOString().slice(0, 10)}:d${offset}`,
        metadata: { vehicleId: vehicle.id, daysLeft: offset },
      });
      if (created) count += 1;
    }
  }
  return count;
}

async function runCorrectionDeadlines(db: SchedDb, now: Date): Promise<number> {
  const from = now;
  const to = addDay(now, 3);
  const within = { gte: from, lte: to };
  const [vehicles, people, companies] = await Promise.all([
    db.vehicle.findMany({
      where: { correctionDeadline: within, account: { deletionRequestedAt: null } },
      select: { id: true, accountId: true, regPlate: true, correctionDeadline: true, account: { select: { country: true, currency: true } } },
      take: 5000,
    }),
    db.verificationAttempt.findMany({
      where: { status: { in: ["failed", "correction"] }, OR: [{ correctionDeadline: within }, { finalEvidenceDeadline: within }], account: { deletionRequestedAt: null } },
      select: { id: true, accountId: true, correctionDeadline: true, finalEvidenceDeadline: true, account: { select: { country: true, currency: true } } },
      take: 5000,
    }),
    db.account.findMany({
      where: { companyCorrectionDeadline: within, deletionRequestedAt: null },
      select: { id: true, companyCorrectionDeadline: true, country: true, currency: true },
      take: 5000,
    }),
  ]);
  let count = 0;
  const tomorrow = async (accountId: string, market: { country: string; currency: string }, deadline: Date | null, kind: string, subject: string, entityId: string, subjectLabel: string) => {
    if (!deadline || daysUntilInstant(deadline, now, marketTimeZone(market)) !== 1) return;
    const created = await notify(db, {
      accountId,
      type: "correction_deadline",
      title: `Your ${subjectLabel} correction deadline is tomorrow`,
      body: `The free correction window for ${subject} closes tomorrow. Submit your corrected details before then to avoid a new paid check.`,
      eventKey: `correction-deadline:${kind}:${entityId}:${deadline.toISOString()}:d1`,
      metadata: { kind, entityId, deadline: deadline.toISOString() },
    });
    if (created) count += 1;
  };
  for (const v of vehicles) await tomorrow(v.accountId, v.account, v.correctionDeadline, "vehicle", `vehicle ${v.regPlate}`, v.id, "vehicle");
  for (const p of people) {
    await tomorrow(p.accountId, p.account, p.correctionDeadline, "person", "your identity check", p.id, "identity");
    await tomorrow(p.accountId, p.account, p.finalEvidenceDeadline, "person-final", "your identity check", p.id, "identity");
  }
  for (const c of companies) await tomorrow(c.id, c, c.companyCorrectionDeadline, "company", "your company verification", c.id, "company");
  return count;
}

const FREE_REASONS = new Set(["month_0", "poster_window", "new_poster_trial", "pilot", "driver_window"]);

async function runPlanBilling(db: SchedDb, now: Date): Promise<number> {
  let count = 0;
  let cursor: string | undefined;
  for (let page = 0; page < MAX_ACCOUNT_PAGES; page += 1) {
    const accounts: Array<{ id: string; country: string; currency: string; planType: string | null; fleetVehicleCount: number | null }> = await db.account.findMany({
      where: { deletionRequestedAt: null, verificationStatus: { not: "suspended" }, NOT: { country: "IN" } },
      select: { id: true, country: true, currency: true, planType: true, fleetVehicleCount: true },
      orderBy: { id: "asc" },
      take: ACCOUNT_PAGE,
      ...(cursor ? { cursor: { id: cursor }, skip: 1 } : {}),
    });
    if (accounts.length === 0) break;
    cursor = accounts[accounts.length - 1].id;
    for (const account of accounts) {
      try {
        const snapshot = await getReminderSnapshot(account.id, now);
        if (!snapshot) continue;
        const tz = marketTimeZone(account);
        const billing = snapshot.billing;
        if (billing && billing.paymentDue && billing.currentPeriod && daysUntilInstant(billing.currentPeriod.end, now, tz) === 1) {
          const minor = getPaidPriceMinorUnits(account as any, billing.plan === "poster" ? "poster" : null);
          const price = minor === null ? null : `${symbolFor(account.currency)}${minorUnitsToMajorUnits(minor, account.currency).toFixed(2)}`;
          const created = await notify(db, {
            accountId: account.id,
            type: "plan_renewal",
            title: "Your plan renews tomorrow",
            body: planRenewalBody(price, subscriptionCheckoutConnected()),
            eventKey: `plan-renewal:${account.id}:${billing.currentPeriod.end.toISOString()}`,
            metadata: { plan: billing.plan, periodEnd: billing.currentPeriod.end.toISOString(), providerConnected: subscriptionCheckoutConnected() },
          });
          if (created) count += 1;
        }
        for (const [scope, entitlement] of [["post", snapshot.post], ["drive", snapshot.drive]] as const) {
          if (!entitlement.allowed || !FREE_REASONS.has(entitlement.reason) || !entitlement.endsAt) continue;
          if (daysUntilInstant(entitlement.endsAt, now, tz) !== 1) continue;
          const created = await notify(db, {
            accountId: account.id,
            type: "free_period_ending",
            title: "Your free period ends tomorrow",
            body: freePeriodEndingBody(subscriptionCheckoutConnected()),
            eventKey: `free-ending:${account.id}:${scope}:${entitlement.endsAt.toISOString()}`,
            metadata: { scope, reason: entitlement.reason, endsAt: entitlement.endsAt.toISOString() },
          });
          if (created) count += 1;
        }
      } catch (error) {
        console.error("Plan reminder failed for one account.", { errorName: error instanceof Error ? error.name : "UnknownError" });
      }
    }
    if (accounts.length < ACCOUNT_PAGE) break;
  }
  return count;
}

/** Idempotent (eventKey-based): safe to run several times a day. Intended to be called once daily by a cron. */
export async function runScheduledNotifications(db: SchedDb, now: Date = new Date()): Promise<ScheduledRunSummary> {
  const vehicleReminders = await runVehicleExpiry(db, now);
  const correctionReminders = await runCorrectionDeadlines(db, now);
  const planReminders = await runPlanBilling(db, now);
  return { vehicleReminders, correctionReminders, planReminders };
}
