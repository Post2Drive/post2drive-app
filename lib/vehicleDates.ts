export type ParsedDateField = { date: Date | null; dateKey: string | null; error: string | null };

/** Parse a date-input value as a calendar day without browser timezone conversion. */
export function parseOptionalDateField(value: unknown, label: string): ParsedDateField {
  if (value === undefined || value === null || value === "") return { date: null, dateKey: null, error: null };
  if (typeof value !== "string" || !/^\\d{4}-\\d{2}-\\d{2}$/.test(value)) {
    return { date: null, dateKey: null, error: label + " must be a valid calendar date." };
  }
  const date = new Date(value + "T00:00:00.000Z");
  if (Number.isNaN(date.getTime()) || date.toISOString().slice(0, 10) !== value) {
    return { date: null, dateKey: null, error: label + " must be a valid calendar date." };
  }
  return { date, dateKey: value, error: null };
}
export function marketDateKey(value: Date, timeZone: string): string {
  const parts = new Intl.DateTimeFormat("en-GB", { timeZone, year: "numeric", month: "2-digit", day: "2-digit" }).formatToParts(value);
  const get = (type: string) => parts.find((part) => part.type === type)?.value ?? "";
  return get("year") + "-" + get("month") + "-" + get("day");
}
