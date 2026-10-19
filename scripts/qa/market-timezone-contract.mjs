#!/usr/bin/env node
import assert from "node:assert/strict";
import { localDateTimeToInstant } from "../../lib/localTime.ts";
import { MARKETS, marketTimeZone } from "../../lib/market.ts";
import { TIME_ZONE_OPTIONS, getTimeZoneOptions } from "../../lib/localisation.ts";
import { marketDateKey, parseOptionalDateField } from "../../lib/vehicleDates.ts";

const local = (date, time, timeZone) => {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  return localDateTimeToInstant({ year, month, day, hour, minute }, timeZone);
};


// Vehicle expiry inputs are calendar dates, not instants. Reject impossible dates
// and malformed strings; compute "today" in the account market's timezone.
assert.deepEqual(parseOptionalDateField("", "Insurance expiry date"), { date: null, dateKey: null, error: null });
assert.equal(parseOptionalDateField("2028-02-29", "Insurance expiry date").dateKey, "2028-02-29", "valid leap day must be accepted");
assert.match(parseOptionalDateField("2027-02-29", "Insurance expiry date").error ?? "", /valid calendar date/, "invalid leap day must be rejected");
assert.match(parseOptionalDateField("2026-04-31", "Insurance expiry date").error ?? "", /valid calendar date/, "impossible month/day must be rejected");
assert.match(parseOptionalDateField("2026-1-02", "Insurance expiry date").error ?? "", /valid calendar date/, "non-padded dates must be rejected");
assert.match(parseOptionalDateField(new Date("2026-10-20"), "Insurance expiry date").error ?? "", /valid calendar date/, "non-string date input must be rejected");
const nearUtcMidnight = new Date("2026-10-20T00:30:00.000Z");
assert.equal(marketDateKey(nearUtcMidnight, "America/Los_Angeles"), "2026-10-19", "US expiry boundary must use local date, not UTC date");
assert.equal(marketDateKey(nearUtcMidnight, "Asia/Kolkata"), "2026-10-20", "India expiry boundary must use local date, not browser/UTC date");

assert.equal(local("2026-01-15", "09:00", "Europe/London").toISOString(), "2026-01-15T09:00:00.000Z", "UK winter time should use GMT");
assert.equal(local("2026-07-15", "09:00", "Europe/London").toISOString(), "2026-07-15T08:00:00.000Z", "UK summer time should use BST");
assert.equal(local("2026-07-15", "09:00", "Asia/Kolkata").toISOString(), "2026-07-15T03:30:00.000Z", "India time should use IST");
assert.equal(marketTimeZone({ country: "IE", currency: "EUR" }), "Europe/Dublin", "Ireland uses its own local timezone");
assert.equal(marketTimeZone({ country: "FR", currency: "EUR" }), "Europe/Paris", "France uses its own local timezone");
for (const market of Object.values(MARKETS)) {
  assert.doesNotThrow(() => new Intl.DateTimeFormat("en-GB", { timeZone: market.timeZone }), `${market.country} must have a valid IANA timezone`);
  const options = getTimeZoneOptions(market.country, market.timeZone);
  assert.ok(options.some((option) => option.value === market.timeZone), `${market.country} must offer its default timezone`);
  for (const option of options) {
    assert.doesNotThrow(() => new Intl.DateTimeFormat("en-GB", { timeZone: option.value }), `${market.country} timezone option ${option.value} must be a valid IANA timezone`);
  }
}
for (const [country, expectedZones] of Object.entries({
  US: ["America/New_York", "America/Los_Angeles"],
  CA: ["America/Toronto", "America/Vancouver"],
  AU: ["Australia/Sydney", "Australia/Perth"],
  NZ: ["Pacific/Auckland", "Pacific/Chatham"],
  ES: ["Europe/Madrid", "Atlantic/Canary"],
  PT: ["Europe/Lisbon", "Atlantic/Madeira", "Atlantic/Azores"],
  FR: ["Europe/Paris", "America/Guadeloupe", "Indian/Reunion", "Pacific/Noumea"],
  DK: ["Europe/Copenhagen", "Atlantic/Faroe", "America/Nuuk"],
})) {
  const available = TIME_ZONE_OPTIONS[country]?.map((option) => option.value) ?? [];
  for (const zone of expectedZones) {
    assert.ok(available.includes(zone), `${country} must offer ${zone} for multi-time-zone destinations`);
  }
}
assert.equal(local("2026-07-15", "09:00", marketTimeZone({ country: "FR", currency: "EUR" })).toISOString(), "2026-07-15T07:00:00.000Z", "France summer time should use CEST");
assert.equal(local("2026-01-15", "09:00", marketTimeZone({ country: "BG", currency: "EUR" })).toISOString(), "2026-01-15T07:00:00.000Z", "Bulgaria winter time should use EET");
assert.throws(() => local("2026-03-29", "01:30", "Europe/London"), /INVALID_PICKUP_TIME_DST/, "nonexistent UK DST wall time must be rejected");
assert.throws(() => local("2026-03-29", "02:30", "Europe/Paris"), /INVALID_PICKUP_TIME_DST/, "nonexistent French DST wall time must be rejected");
assert.throws(() => local("2026-10-25", "01:30", "Europe/London"), /AMBIGUOUS_PICKUP_TIME_DST/, "repeated UK DST wall time must be rejected");
assert.throws(() => local("2026-02-30", "10:00", "Europe/London"), /INVALID_PICKUP_TIME/, "impossible calendar dates must be rejected");
console.log(`Market timezone contract checks passed for ${Object.keys(MARKETS).length} supported markets and ${Object.values(TIME_ZONE_OPTIONS).reduce((n, options) => n + options.length, 0)} explicit timezone options, including overseas/island destinations, DST gap/repeat and invalid calendar dates.`);
