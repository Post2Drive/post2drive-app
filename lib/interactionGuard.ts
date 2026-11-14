/** Pure rules behind components/interaction-guards.tsx, kept here so they can be tested without a browser. */

/** A second click or tap on the same control inside this window is dropped. */
export const REPEAT_ACTIVATION_MS = 600;
/** A second submit of the same form inside this window is dropped. */
export const REPEAT_SUBMIT_MS = 1000;

export function isRepeatActivation(previous: number | undefined, now: number, windowMs: number = REPEAT_ACTIVATION_MS): boolean {
  return previous !== undefined && now - previous >= 0 && now - previous < windowMs;
}

/** Pixels of the layout viewport hidden by the on-screen keyboard (0 when none or when it is only browser chrome). */
export function keyboardInset(layoutHeight: number, visualHeight: number, visualOffsetTop: number): number {
  const inset = Math.round(layoutHeight - visualHeight - visualOffsetTop);
  return inset > 80 ? inset : 0;
}
