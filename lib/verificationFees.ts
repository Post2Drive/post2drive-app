/*
 * Generic verification fee recording (EXECUTION_PLAN §5). One VerificationFeePayment
 * row per fee-bearing action, always "pending": no checkout/provider is connected,
 * and only a verified provider payment event may ever mark a record paid.
 *
 * Callers (person verification start, company relationship change, vehicle added)
 * pass their own transaction client and a deterministic idempotencyKey so a retried
 * or concurrent request can never create a second charge for the same action.
 */
import { VERIFICATION_FEES } from "@/lib/pricing";
import { majorUnitsToMinorUnits } from "@/lib/currencyMinorUnits";
import { verificationFeeTotalMinorUnits, type VerificationFeeLine } from "@/lib/verificationProcess";

export type VerificationFeeAction =
  | "poster_verification"
  | "driver_verification"
  | "driver_upgrade"
  | "new_company_relationship"
  | "vehicle_added";

type FeeRecord = { id: string; amountMinorUnits: number; currency: string; status: string; vehicleIds: string[] };

/** Minimal Prisma surface (a PrismaClient or an interactive-transaction client). */
export type VerificationFeeDb = {
  verificationFeePayment: {
    findUnique(args: { where: { idempotencyKey: string } }): Promise<FeeRecord | null>;
    findMany(args: { where: { accountId: string }; select: { vehicleIds: true } }): Promise<Array<{ vehicleIds: string[] }>>;
    create(args: { data: Record<string, unknown> }): Promise<FeeRecord>;
  };
};

export function isFeeFreeMarket(account: { country?: string | null; currency?: string | null }) {
  return account.country === "IN" && account.currency === "INR";
}

/**
 * Record one pending fee for one action. Returns null (no record) for India or an
 * empty line list. Returns { created: false } with the existing row when this
 * idempotencyKey was already recorded, so callers never charge twice.
 */
export async function recordVerificationFee(
  db: VerificationFeeDb,
  input: {
    accountId: string;
    country: string;
    currency: string;
    action: VerificationFeeAction;
    lines: VerificationFeeLine[];
    idempotencyKey: string;
    vehicleIds?: string[];
  },
): Promise<{ record: FeeRecord; created: boolean } | null> {
  if (isFeeFreeMarket(input) || input.lines.length === 0) return null;
  if (!input.idempotencyKey || input.idempotencyKey.length > 200) throw new RangeError("idempotencyKey is required.");

  const existing = await db.verificationFeePayment.findUnique({ where: { idempotencyKey: input.idempotencyKey } });
  if (existing) return { record: existing, created: false };

  const amountMinorUnits = verificationFeeTotalMinorUnits(input.lines, input.currency);
  const record = await db.verificationFeePayment.create({
    data: {
      accountId: input.accountId,
      action: input.action,
      lineItems: input.lines.map((line) => ({
        code: line.code,
        quantity: line.quantity,
        unitMinorUnits: majorUnitsToMinorUnits(VERIFICATION_FEES[line.code], input.currency),
      })),
      amountMinorUnits,
      currency: input.currency,
      vehicleIds: input.vehicleIds ?? [],
      // Never "paid" here: settlement requires a verified provider event.
      status: "pending",
      idempotencyKey: input.idempotencyKey,
    },
  });
  return { record, created: true };
}

/** Vehicle ids not yet covered by any fee record on this account. */
export async function uncoveredVehicleIds(db: VerificationFeeDb, accountId: string, vehicleIds: readonly string[]) {
  const records = await db.verificationFeePayment.findMany({ where: { accountId }, select: { vehicleIds: true } });
  const covered = new Set(records.flatMap((record) => record.vehicleIds));
  return vehicleIds.filter((id) => !covered.has(id));
}
