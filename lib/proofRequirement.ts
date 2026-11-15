import { rulesForAccount } from "./marketRules.ts";

/**
 * Enforcement switch for required proof photos. It stays off until the app has
 * screens for taking the photos; without them a required photo would block
 * every pickup and delivery. Set POST2DRIVE_PROOF_PHOTOS_ENFORCED=true to turn
 * the requirement on for the markets whose rules ask for it.
 */
export function proofEnforcementOn(env: Record<string, string | undefined> = process.env): boolean {
  return env.POST2DRIVE_PROOF_PHOTOS_ENFORCED === "true";
}

export type ProofGateResult =
  | { ok: true }
  | { ok: false; status: 409; code: "PROOF_PHOTO_REQUIRED"; error: string };

type GateDb = {
  account: { findUnique(args: unknown): Promise<{ country?: string | null; currency?: string | null } | null> };
  jobProofPhoto: { count(args: unknown): Promise<number> };
};

const MESSAGES = {
  pickup: "The driver needs to add a photo of the goods at pickup before pickup can be confirmed.",
  delivery: "The driver needs to add a photo of the goods at drop-off before the job can be marked delivered.",
} as const;

/**
 * In markets that require proof photos, the driver must have added at least one
 * photo for this stage before the job can move on. Either party may press the
 * button; it is always the driver's photo that counts.
 */
export async function checkProofPhotoGate(
  db: GateDb,
  job: { id: string; posterId: string; acceptedById: string | null },
  stage: "pickup" | "delivery",
  env: Record<string, string | undefined> = process.env,
): Promise<ProofGateResult> {
  if (!proofEnforcementOn(env)) return { ok: true };
  const poster = await db.account.findUnique({ where: { id: job.posterId }, select: { country: true, currency: true } });
  if (!poster) return { ok: true };
  if (!rulesForAccount(poster).proofPhotosRequired) return { ok: true };
  if (!job.acceptedById) return { ok: false, status: 409, code: "PROOF_PHOTO_REQUIRED", error: MESSAGES[stage] };
  const count = await db.jobProofPhoto.count({ where: { jobId: job.id, stage, uploadedById: job.acceptedById } });
  return count > 0 ? { ok: true } : { ok: false, status: 409, code: "PROOF_PHOTO_REQUIRED", error: MESSAGES[stage] };
}
