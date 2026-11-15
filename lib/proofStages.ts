/** Proof photo rules that the screens need too. No server-only imports here. */
export const PROOF_STAGES = ["pickup", "delivery"] as const;
export type ProofStage = (typeof PROOF_STAGES)[number];

/** Per person, per stage. */
export const MAX_PROOF_PHOTOS_PER_STAGE = 3;
/** Photos are kept this long after upload, or until a dispute on the job is resolved. */
export const PROOF_RETENTION_DAYS = 30;

export function isProofStage(value: unknown): value is ProofStage {
  return typeof value === "string" && (PROOF_STAGES as readonly string[]).includes(value);
}

/**
 * The job statuses in which each stage's photos may be added. Pickup photos
 * cover the handover (a short grace after pickup is confirmed); delivery
 * photos cover the drop-off and the moment the poster inspects the goods.
 */
export const PROOF_STAGE_JOB_STATUSES: Record<ProofStage, readonly string[]> = {
  pickup: ["accepted", "in_transit"],
  delivery: ["in_transit", "delivered"],
};

export const PROOF_STAGE_LABELS: Record<ProofStage, string> = {
  pickup: "At pickup",
  delivery: "At drop-off",
};
