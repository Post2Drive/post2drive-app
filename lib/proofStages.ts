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

/**
 * The job statuses in which a person may remove a photo they added. A photo can
 * be taken back until that step is submitted (pickup confirmed, delivery marked)
 * so a wrong picture can be fixed; after that it is evidence and stays.
 */
export const PROOF_STAGE_REMOVABLE_STATUSES: Record<ProofStage, readonly string[]> = {
  pickup: ["accepted"],
  delivery: ["in_transit"],
};

export const PROOF_STAGE_LABELS: Record<ProofStage, string> = {
  pickup: "At pickup",
  delivery: "At drop-off",
};
