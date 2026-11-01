/**
 * Cookie / tracking consent. Essential cookies (sign-in session, CSRF, this
 * consent record) need no consent. Anything optional — analytics, session
 * replay, marketing pixels — must check `hasConsent("analytics")` and must
 * not load until it returns true. Default is OFF.
 */
export const CONSENT_COOKIE = "p2d_consent";
export const CONSENT_VERSION = 1;
export const CONSENT_EVENT = "p2d:consent-change";
export const OPEN_CONSENT_EVENT = "p2d:open-consent";

export type ConsentCategory = "analytics";
export type ConsentState = { v: number; analytics: boolean; at: string };

export function readConsent(): ConsentState | null {
  if (typeof document === "undefined") return null;
  try {
    const raw = document.cookie.split("; ").find((part) => part.startsWith(`${CONSENT_COOKIE}=`));
    if (!raw) return null;
    const parsed = JSON.parse(decodeURIComponent(raw.slice(CONSENT_COOKIE.length + 1)));
    if (parsed?.v !== CONSENT_VERSION || typeof parsed.analytics !== "boolean") return null;
    return parsed as ConsentState;
  } catch {
    return null;
  }
}

export function writeConsent(analytics: boolean) {
  const state: ConsentState = { v: CONSENT_VERSION, analytics, at: new Date().toISOString() };
  const secure = typeof location !== "undefined" && location.protocol === "https:" ? "; Secure" : "";
  // 180 days, first-party, never sent to third parties.
  document.cookie = `${CONSENT_COOKIE}=${encodeURIComponent(JSON.stringify(state))}; Path=/; Max-Age=${60 * 60 * 24 * 180}; SameSite=Lax${secure}`;
  window.dispatchEvent(new CustomEvent(CONSENT_EVENT, { detail: state }));
  return state;
}

export function hasConsent(category: ConsentCategory): boolean {
  return readConsent()?.[category] === true;
}

export function openConsentSettings() {
  window.dispatchEvent(new Event(OPEN_CONSENT_EVENT));
}
