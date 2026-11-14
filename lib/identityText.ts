/**
 * Identity text rules shared by signup, login and account updates.
 *
 * Emails are compared as plain ASCII after Unicode compatibility folding, so a
 * look-alike address (full-width letters, Cyrillic "a", a hidden zero-width
 * character) can never register as a second account that reads the same as
 * an existing one. Display names keep every script (Telugu, Hindi, ...) but
 * may not carry invisible or text-direction characters used to imitate
 * another member's name.
 */
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const ASCII_PRINTABLE = /^[\x21-\x7e]+$/;
// Controls, zero-width space, direction marks/overrides/isolates, word joiner,
// byte-order mark. U+200C/U+200D (joiners) stay allowed: Indic scripts need them.
const HIDDEN_CHARACTERS = /[\u0000-\u001f\u007f-\u009f\u00ad\u200b\u200e\u200f\u202a-\u202e\u2060-\u2069\ufeff]/;

export const MAX_EMAIL_LENGTH = 254;

/** Returns the canonical email, or null when it is not an acceptable address. */
export function normalizeEmail(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const email = raw.normalize("NFKC").trim().toLowerCase();
  if (!email || email.length > MAX_EMAIL_LENGTH) return null;
  if (!ASCII_PRINTABLE.test(email) || !EMAIL_SHAPE.test(email)) return null;
  return email;
}

/** Returns the cleaned display text, or null when it hides characters. */
export function normalizeDisplayText(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  if (HIDDEN_CHARACTERS.test(raw)) return null;
  return raw.normalize("NFKC").trim().replace(/\s+/g, " ");
}
