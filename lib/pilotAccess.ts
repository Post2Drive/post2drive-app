import { createHash } from "node:crypto";

/** Pilot access codes expire two weeks after creation, matching the existing QA cohort window. */
export const PILOT_ACCESS_CODE_TTL_MS = 14 * 24 * 60 * 60 * 1000;

/**
 * Pilot codes extend the existing one-time TesterAccessCode architecture.
 * They are accepted only when signup separately confirms the QA staging guard.
 */
export function isPilotTesterCode(code: string): boolean {
  return /^P2D-UKQA-[A-F0-9]{24}$/i.test(code.trim());
}

export function hashPilotAccessCode(code: string): string {
  return createHash("sha256").update(code.trim().toUpperCase()).digest("hex");
}
