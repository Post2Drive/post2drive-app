export type LocalDateTimeParts = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
};

/** Convert a market-local wall-clock date/time to one UTC instant. Reject DST gaps and repeats. */
export function localDateTimeToInstant(target: LocalDateTimeParts, timeZone: string): Date {
  const { year, month, day, hour, minute } = target;
  if (![year, month, day, hour, minute].every(Number.isInteger) ||
      month < 1 || month > 12 || day < 1 || day > 31 || hour < 0 || hour > 23 || minute < 0 || minute > 59) {
    throw new Error("INVALID_PICKUP_TIME");
  }

  const calendarCheck = new Date(Date.UTC(year, month - 1, day));
  if (calendarCheck.getUTCFullYear() !== year || calendarCheck.getUTCMonth() !== month - 1 || calendarCheck.getUTCDate() !== day) {
    throw new Error("INVALID_PICKUP_TIME");
  }

  const baseUtc = Date.UTC(year, month - 1, day, hour, minute);
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
  });
  const matches: Date[] = [];
  const offsets = new Set<number>();

  // Sample nearby instants to discover the timezone's possible offsets around
  // this date (e.g. both GMT and BST near a UK clock change). This avoids
  // scanning every minute across a 24-hour window for each job action.
  for (let deltaHours = -36; deltaHours <= 36; deltaHours += 6) {
    const sample = new Date(baseUtc + deltaHours * 60 * 60_000);
    const parts = formatter.formatToParts(sample);
    const values = Object.fromEntries(
      parts.filter((part) => part.type !== "literal")
        .map((part) => [part.type, Number(part.value)]),
    ) as Record<string, number>;
    const representedAsUtc = Date.UTC(values.year, values.month - 1, values.day, values.hour, values.minute);
    offsets.add(representedAsUtc - sample.getTime());
  }

  for (const offsetMs of offsets) {
    const candidate = new Date(baseUtc - offsetMs);
    const values = Object.fromEntries(
      formatter.formatToParts(candidate)
        .filter((part) => part.type !== "literal")
        .map((part) => [part.type, Number(part.value)]),
    ) as Record<string, number>;

    if (values.year === year && values.month === month && values.day === day &&
        values.hour === hour && values.minute === minute) {
      matches.push(candidate);
    }
  }

  if (matches.length === 0) throw new Error("INVALID_PICKUP_TIME_DST");
  if (matches.length > 1) throw new Error("AMBIGUOUS_PICKUP_TIME_DST");
  return matches[0];
}
