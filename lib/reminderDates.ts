// Pure reminder date and wording helpers. Self-contained (no path aliases) so contract tests can import it directly.
const DAY_MS = 24 * 60 * 60 * 1000;
export const DOCUMENT_REMINDER_DAYS = [7, 1, 0] as const;

/** YYYY-MM-DD for the instant as seen in a timezone. */
function dateKeyIn(value: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(value);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

/** Whole calendar days from one YYYY-MM-DD key to another (UTC arithmetic on date keys). */
export function daysBetweenDateKeys(fromKey: string, toKey: string): number {
  return Math.round((Date.parse(`${toKey}T00:00:00Z`) - Date.parse(`${fromKey}T00:00:00Z`)) / DAY_MS);
}

/** Days until a stored date-only expiry (UTC midnight = the calendar date itself), as seen on the market's calendar today. */
export function daysUntilExpiryDate(expiry: Date, now: Date, timeZone: string): number {
  return daysBetweenDateKeys(dateKeyIn(now, timeZone), expiry.toISOString().slice(0, 10));
}

/** Days until a timestamp deadline, comparing calendar dates in the market's timezone. */
export function daysUntilInstant(target: Date, now: Date, timeZone: string): number {
  return daysBetweenDateKeys(dateKeyIn(now, timeZone), dateKeyIn(target, timeZone));
}

export function documentReminderOffset(daysLeft: number): 7 | 1 | 0 | null {
  return (DOCUMENT_REMINDER_DAYS as readonly number[]).includes(daysLeft) ? (daysLeft as 7 | 1 | 0) : null;
}

export function expiryWording(label: string, regPlate: string, daysLeft: 7 | 1 | 0) {
  if (daysLeft === 0) return { title: `${label} expires today`, body: `The ${label.toLowerCase()} for vehicle ${regPlate} expires today. Renew it and update the vehicle to keep taking jobs.` };
  if (daysLeft === 1) return { title: `${label} expires tomorrow`, body: `The ${label.toLowerCase()} for vehicle ${regPlate} expires tomorrow. Renew it and update the vehicle to keep taking jobs.` };
  return { title: `${label} expires in 7 days`, body: `The ${label.toLowerCase()} for vehicle ${regPlate} expires in 7 days. Renew it and update the vehicle to keep taking jobs.` };
}

export function planRenewalBody(price: string | null, providerConnected: boolean) {
  const amount = price ? `${price} ` : "";
  // Nothing is ever taken automatically: with checkout connected the user pays in the app.
  return providerConnected
    ? `Your plan renews tomorrow: ${amount}will be due. Pay in Account settings to keep your access.`
    : `Your plan renews tomorrow: ${amount}will be due. No payment provider is connected yet, so nothing is charged automatically.`;
}

export function freePeriodEndingBody(providerConnected: boolean) {
  return providerConnected
    ? "Your free access ends tomorrow. After that your plan will be due. Nothing is charged automatically: you pay in Account settings."
    : "Your free access ends tomorrow. After that your plan will be due. No payment provider is connected yet, so nothing is charged automatically.";
}

