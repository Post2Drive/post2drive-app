/*
 * Pure verification-process rules (EXECUTION_PLAN §1 and §5). No database access:
 * lib/verification.ts, the company-verification route and lib/verificationFees.ts
 * load the records and apply these decisions, so every rule here is unit-testable.
 */
import { VERIFICATION_FEES } from "@/lib/pricing";
import { majorUnitsToMinorUnits } from "@/lib/currencyMinorUnits";
import { localDateTimeToInstant } from "@/lib/localTime";

export const FIRST_FAILURE_CORRECTION_WORKING_DAYS = 10;
export const SECOND_FAILURE_FINAL_WORKING_DAYS = 3;
export const FREE_RECHECK_CALENDAR_DAYS = 90;
const DAY_MS = 24 * 60 * 60 * 1000;

/* ---------- Order: email -> phone -> person ID + company ---------- */

export type OrderBlock = "email_unverified" | "phone_unverified";

/**
 * Non-India verification order. Person ID may only start after the acting user's
 * email and the account's phone are verified. Returns null when allowed.
 * India never reaches person/company verification (rejected before this check).
 * `stagingPilotQa` keeps the staging-only UK student pilot accounts working: their
 * email is intentionally unverified and they are exempt from paid-path gates.
 */
export function verificationOrderBlock(
  account: { phoneVerifiedAt?: Date | string | null },
  user: { emailVerifiedAt?: Date | string | null } | null | undefined,
  options: { stagingPilotQa?: boolean } = {},
): OrderBlock | null {
  if (options.stagingPilotQa) return null;
  if (!user?.emailVerifiedAt) return "email_unverified";
  if (!account.phoneVerifiedAt) return "phone_unverified";
  return null;
}

export const ORDER_BLOCK_MESSAGES: Record<OrderBlock, string> = {
  email_unverified: "Verify your email address before starting identity verification.",
  phone_unverified: "Verify your mobile number with a one-time code before starting identity verification.",
};

/* ---------- Fees ---------- */

export type VerificationFeeCode = keyof typeof VERIFICATION_FEES;
export type VerificationFeeLine = { code: VerificationFeeCode; quantity: number };
export type VerificationPath = "poster" | "driver";

/** Poster accounts take the poster path (Step 2); driver/both take the driver path (Step 3). */
export function verificationPathForAccountType(type: "poster" | "driver" | "both"): VerificationPath {
  return type === "poster" ? "poster" : "driver";
}

/**
 * Path actually charged (EXECUTION_PLAN §1, §5). New signups are all type "both", so the
 * path follows what the account is doing: no vehicle registered = poster path (2.50);
 * at least one vehicle = driver/fleet path (3.50, no 2.50). Legacy single-role types keep their path.
 */
export function verificationPathForAccount(type: "poster" | "driver" | "both", vehicleCount: number): VerificationPath {
  if (type === "poster") return "poster";
  if (type === "driver") return "driver";
  return vehicleCount > 0 ? "driver" : "poster";
}

/**
 * Line items for one verification action. Driver-only users never pay the poster
 * 2.50 (their Step 3 includes the person check); a poster upgrading pays the 3.50
 * driver package with the person check reused. Extra vehicles ride in the same record.
 */
export function verificationPathFeeLines(path: VerificationPath, additionalVehicles = 0): VerificationFeeLine[] {
  if (!Number.isInteger(additionalVehicles) || additionalVehicles < 0) throw new RangeError("additionalVehicles must be a non-negative integer.");
  if (path === "poster") return [{ code: "personAndCompany", quantity: 1 }];
  const lines: VerificationFeeLine[] = [{ code: "driverAndFirstVehicle", quantity: 1 }];
  if (additionalVehicles > 0) lines.push({ code: "additionalVehicle", quantity: additionalVehicles });
  return lines;
}

/** Total of line items in the currency's minor units (pence/cents). */
export function verificationFeeTotalMinorUnits(lines: readonly VerificationFeeLine[], currency: string): number {
  let total = 0;
  for (const line of lines) {
    if (!(line.code in VERIFICATION_FEES)) throw new RangeError("Unknown verification fee code.");
    if (!Number.isInteger(line.quantity) || line.quantity < 1) throw new RangeError("Fee quantity must be a positive integer.");
    total += majorUnitsToMinorUnits(VERIFICATION_FEES[line.code], currency) * line.quantity;
  }
  return total;
}

/* ---------- Working days in the market time zone ---------- */

function localDateParts(instant: Date, timeZone: string) {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(instant);
  const get = (type: string) => Number(parts.find((part) => part.type === type)?.value);
  return { year: get("year"), month: get("month"), day: get("day") };
}

/**
 * End (23:59:59.999 local) of the Nth working day after `from`'s local date.
 * Working days are Monday-Friday in the market time zone. No public-holiday
 * calendar exists in lib/localisation, so holidays are not excluded.
 */
export function addMarketWorkingDays(from: Date, workingDays: number, timeZone: string): Date {
  if (!Number.isInteger(workingDays) || workingDays < 1) throw new RangeError("workingDays must be a positive integer.");
  const start = localDateParts(from, timeZone);
  const cursor = new Date(Date.UTC(start.year, start.month - 1, start.day));
  let remaining = workingDays;
  while (remaining > 0) {
    cursor.setUTCDate(cursor.getUTCDate() + 1);
    const weekday = cursor.getUTCDay();
    if (weekday !== 0 && weekday !== 6) remaining--;
  }
  cursor.setUTCDate(cursor.getUTCDate() + 1);
  const nextLocalMidnight = localDateTimeToInstant(
    { year: cursor.getUTCFullYear(), month: cursor.getUTCMonth() + 1, day: cursor.getUTCDate(), hour: 0, minute: 0 },
    timeZone,
  );
  return new Date(nextLocalMidnight.getTime() - 1);
}

/** Deadline and resulting status when attempt at `cyclePosition` fails. */
export function failureOutcome(cyclePosition: number, failedAt: Date, timeZone: string) {
  if (cyclePosition <= 1) {
    return { status: "correction" as const, accountStatus: "failed" as const,
      correctionDeadline: addMarketWorkingDays(failedAt, FIRST_FAILURE_CORRECTION_WORKING_DAYS, timeZone), finalEvidenceDeadline: null };
  }
  if (cyclePosition === 2) {
    return { status: "manual_review" as const, accountStatus: "manual_review" as const,
      correctionDeadline: null, finalEvidenceDeadline: addMarketWorkingDays(failedAt, SECOND_FAILURE_FINAL_WORKING_DAYS, timeZone) };
  }
  // Final evidence also failed: the cycle is closed; a new attempt needs a new fee.
  return { status: "failed" as const, accountStatus: "failed" as const, correctionDeadline: null, finalEvidenceDeadline: null };
}

/* ---------- Start decision: reuse, free correction, free recheck, or charge ---------- */

export type AttemptSnapshot = {
  id: string;
  attemptNumber: number;
  cyclePosition: number;
  status: string;
  failedAt?: Date | null;
  completedAt?: Date | null;
  correctionDeadline?: Date | null;
  finalEvidenceDeadline?: Date | null;
};

export type StartDecision =
  | { kind: "existing"; attemptId: string }
  | { kind: "new"; cyclePosition: number; charged: boolean;
      reason: "initial" | "correction" | "final_evidence" | "recheck_90_days" | "recheck_paid_plan" | "responsible_person_change" | "new_attempt_after_failure" | "staging_pilot_qa" };

export function hasActivePaidPlan(account: { subscriptionStatus?: string | null; subscriptionEndsAt?: Date | null }, now: Date) {
  return account.subscriptionStatus === "active" && (!account.subscriptionEndsAt || account.subscriptionEndsAt > now);
}

export function withinFreeRecheckWindow(lastSuccessAt: Date | null | undefined, now: Date) {
  return Boolean(lastSuccessAt) && now.getTime() - (lastSuccessAt as Date).getTime() <= FREE_RECHECK_CALENDAR_DAYS * DAY_MS;
}

/**
 * Decide what starting verification means. `attempts` is newest first.
 * - An open attempt (awaiting payment or under review, not failed) is reused: no double charge.
 * - Inside the 10-working-day window after a first failure: free correction (position 2).
 * - Inside the final 3-working-day window after a second failure: free final evidence (position 3).
 * - A cycle that ended in failure (windows exhausted or expired) always needs a new fee.
 * - Otherwise a new cycle is free for: a person check for another user on an already
 *   verified account (same-company responsible-person change), a recheck within 90
 *   calendar days of a successful verification, or while on an active paid plan.
 */
export function decideVerificationStart(input: {
  attempts: readonly AttemptSnapshot[];
  now: Date;
  accountVerified: boolean;
  lastSuccessAt?: Date | null;
  activePaidPlan: boolean;
  stagingPilotQa?: boolean;
}): StartDecision {
  const { attempts, now } = input;
  const latest = attempts[0];
  if (latest && !latest.failedAt && ["awaiting_payment", "pending", "correction"].includes(latest.status)) {
    return { kind: "existing", attemptId: latest.id };
  }
  if (latest?.failedAt && latest.status !== "successful") {
    if (latest.cyclePosition <= 1 && latest.correctionDeadline && now <= latest.correctionDeadline) {
      return { kind: "new", cyclePosition: 2, charged: false, reason: "correction" };
    }
    if (latest.cyclePosition === 2 && latest.finalEvidenceDeadline && now <= latest.finalEvidenceDeadline) {
      return { kind: "new", cyclePosition: 3, charged: false, reason: "final_evidence" };
    }
    if (input.stagingPilotQa) return { kind: "new", cyclePosition: 1, charged: false, reason: "staging_pilot_qa" };
    return { kind: "new", cyclePosition: 1, charged: true, reason: "new_attempt_after_failure" };
  }
  if (input.stagingPilotQa) return { kind: "new", cyclePosition: 1, charged: false, reason: "staging_pilot_qa" };
  if (input.accountVerified) return { kind: "new", cyclePosition: 1, charged: false, reason: "responsible_person_change" };
  if (withinFreeRecheckWindow(input.lastSuccessAt, now)) return { kind: "new", cyclePosition: 1, charged: false, reason: "recheck_90_days" };
  if (input.activePaidPlan) return { kind: "new", cyclePosition: 1, charged: false, reason: "recheck_paid_plan" };
  return { kind: "new", cyclePosition: 1, charged: true, reason: "initial" };
}

/* ---------- Responsible person and company relationship ---------- */

function normaliseCompanyPart(value: string | null | undefined) {
  return (value ?? "").toUpperCase().replace(/[^A-Z0-9]/g, "");
}

/** Same company = same registered number when both have one, otherwise the same normalised name. */
export function isSameCompany(
  current: { companyName?: string | null; companyNumber?: string | null },
  next: { companyName?: string | null; companyNumber?: string | null },
) {
  const currentNumber = normaliseCompanyPart(current.companyNumber);
  const nextNumber = normaliseCompanyPart(next.companyNumber);
  if (currentNumber || nextNumber) return currentNumber === nextNumber;
  const currentName = normaliseCompanyPart(current.companyName);
  return currentName.length > 0 && currentName === normaliseCompanyPart(next.companyName);
}

export type CompanySubmissionDecision =
  | { kind: "reject"; status: number; error: string }
  | { kind: "initial" }
  | { kind: "responsible_person_change" }
  | { kind: "new_company_relationship" };

/**
 * The responsible person must be a user of this account whose person ID passed.
 * On a verified company: same company + different person = free change;
 * a different company = new relationship, re-reviewed and charged.
 */
export function decideCompanySubmission(input: {
  companyVerificationStatus: string;
  current: { companyName?: string | null; companyNumber?: string | null; responsibleUserId?: string | null };
  next: { companyName: string; companyNumber?: string | null };
  responsibleUser: { id: string; accountId: string; personVerifiedAt?: Date | null } | null;
  accountId: string;
}): CompanySubmissionDecision {
  const user = input.responsibleUser;
  if (!user || user.accountId !== input.accountId) {
    return { kind: "reject", status: 400, error: "The responsible person must be a user on this account." };
  }
  if (!user.personVerifiedAt) {
    return { kind: "reject", status: 409, error: "The responsible person must pass identity verification first." };
  }
  if (input.companyVerificationStatus !== "verified") return { kind: "initial" };
  if (isSameCompany(input.current, input.next)) {
    if (input.current.responsibleUserId === user.id) {
      return { kind: "reject", status: 409, error: "This company is already verified with this responsible person." };
    }
    return { kind: "responsible_person_change" };
  }
  return { kind: "new_company_relationship" };
}
