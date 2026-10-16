#!/usr/bin/env node
import assert from "node:assert/strict";
import { localDateTimeToInstant } from "../../lib/localTime.ts";
import { marketTimeZone } from "../../lib/market.ts";

const local = (date, time, timeZone) => {
  const [year, month, day] = date.split("-").map(Number);
  const [hour, minute] = time.split(":").map(Number);
  return localDateTimeToInstant({ year, month, day, hour, minute }, timeZone);
};

assert.equal(local("2026-01-15", "09:00", "Europe/London").toISOString(), "2026-01-15T09:00:00.000Z", "UK winter time should use GMT");
assert.equal(local("2026-07-15", "09:00", "Europe/London").toISOString(), "2026-07-15T08:00:00.000Z", "UK summer time should use BST");
assert.equal(local("2026-07-15", "09:00", "Asia/Kolkata").toISOString(), "2026-07-15T03:30:00.000Z", "India time should use IST");
assert.equal(marketTimeZone({ country: "IE", currency: "EUR" }), "Europe/Dublin", "Ireland uses its own local timezone");
assert.equal(marketTimeZone({ country: "FR", currency: "EUR" }), "Europe/Paris", "France uses its own local timezone");
assert.equal(local("2026-07-15", "09:00", marketTimeZone({ country: "FR", currency: "EUR" })).toISOString(), "2026-07-15T07:00:00.000Z", "France summer time should use CEST");
assert.equal(local("2026-01-15", "09:00", marketTimeZone({ country: "BG", currency: "EUR" })).toISOString(), "2026-01-15T07:00:00.000Z", "Bulgaria winter time should use EET");
assert.throws(() => local("2026-03-29", "01:30", "Europe/London"), /INVALID_PICKUP_TIME_DST/, "nonexistent UK DST wall time must be rejected");
assert.throws(() => local("2026-03-29", "02:30", "Europe/Paris"), /INVALID_PICKUP_TIME_DST/, "nonexistent French DST wall time must be rejected");
assert.throws(() => local("2026-10-25", "01:30", "Europe/London"), /AMBIGUOUS_PICKUP_TIME_DST/, "repeated UK DST wall time must be rejected");
assert.throws(() => local("2026-02-30", "10:00", "Europe/London"), /INVALID_PICKUP_TIME/, "impossible calendar dates must be rejected");
console.log("Market timezone contract checks passed: UK, India and euro-market timezones, DST gap/repeat and invalid calendar date.");
