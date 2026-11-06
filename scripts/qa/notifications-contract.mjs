#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import {
  daysBetweenDateKeys, daysUntilExpiryDate, daysUntilInstant, documentReminderOffset, expiryWording, planRenewalBody,
} from "../../lib/reminderDates.ts";

const source = (path) => readFileSync(path, "utf8");

// ---- Reminder date logic (pure) ----
assert.equal(daysBetweenDateKeys("2026-02-27", "2026-03-01"), 2, "month boundary");
assert.equal(daysBetweenDateKeys("2028-02-28", "2028-03-01"), 2, "leap year");
const noonUtc = new Date("2026-11-06T12:00:00Z");
for (const [days, offset] of [[7, 7], [1, 1], [0, 0]]) {
  const expiry = new Date(Date.UTC(2026, 10, 6 + days));
  assert.equal(documentReminderOffset(daysUntilExpiryDate(expiry, noonUtc, "Europe/London")), offset, `expiry in ${days} days`);
}
for (const other of [2, 3, 6, 8, -1]) {
  assert.equal(documentReminderOffset(other), null, `no document reminder ${other} days out`);
}
// "Today" follows the market timezone, not UTC.
const lateUtc = new Date("2026-11-06T20:00:00Z"); // already 7 Nov in Kolkata (01:30)
assert.equal(daysUntilExpiryDate(new Date(Date.UTC(2026, 10, 7)), lateUtc, "Asia/Kolkata"), 0, "India expiry today uses local date");
assert.equal(daysUntilExpiryDate(new Date(Date.UTC(2026, 10, 7)), lateUtc, "Europe/London"), 1, "UK expiry tomorrow uses local date");
// Deadline instants compare local calendar dates ("tomorrow" = next local day).
assert.equal(daysUntilInstant(new Date("2026-11-07T22:00:00Z"), new Date("2026-11-06T08:00:00Z"), "Europe/London"), 1);
assert.equal(daysUntilInstant(new Date("2026-11-07T22:00:00Z"), new Date("2026-11-06T08:00:00Z"), "Asia/Kolkata"), 2, "22:00Z is already the 8th in India");
assert.match(expiryWording("Insurance", "AB12 CDE", 7).title, /7 days/);
assert.match(expiryWording("MOT", "AB12 CDE", 1).title, /tomorrow/);
assert.match(expiryWording("MOT", "AB12 CDE", 0).title, /today/);
// Billing wording never claims a charge while no provider is connected.
assert.match(planRenewalBody("£5.00", false), /will be due/);
assert.doesNotMatch(planRenewalBody("£5.00", false), /will be charged/);
assert.match(planRenewalBody("£5.00", true), /will be charged/);
assert.match(planRenewalBody(null, false), /^Your plan renews tomorrow:/);

// ---- Helper, provider and scheduler structure ----
const notify = source("lib/notify.ts");
assert.match(notify, /skipDuplicates: true/, "notify must skip duplicate eventKeys without throwing inside a transaction");
assert.match(notify, /getPushProvider/, "notify must call the optional push provider");
assert.match(source("lib/pushProvider.ts"), /return null;/, "no push provider may be connected");
assert.doesNotMatch(source("lib/pushProvider.ts"), /from "(firebase|web-push|apn)/i, "push provider must be structure only");
assert.match(source("lib/providerContracts.ts"), /interface PushNotificationProvider/);
const scheduled = source("lib/scheduledNotifications.ts");
assert.match(scheduled, /export async function runScheduledNotifications/);
assert.match(scheduled, /PAYMENT_PROVIDER_CONNECTED/, "billing wording must depend on the payment-provider flag");
assert.match(scheduled, /marketTimeZone/, "reminders must use the account market timezone");
for (const key of ["vehicle-${kind}-expiry:", "correction-deadline:", "plan-renewal:", "free-ending:"]) {
  assert.ok(scheduled.includes(key), `scheduled eventKey ${key}`);
}
const route = source("app/api/internal/notifications/run/route.ts");
assert.match(route, /POST2DRIVE_SCHEDULER_SECRET/);
assert.match(route, /status: 503/, "scheduler route must fail closed when the secret is unset");
assert.match(route, /timingSafeEqual/, "secret comparison must be constant time");
assert.match(route, /enforceRateLimit/, "scheduler route must be rate limited");
assert.ok(route.indexOf("status: 503") < route.indexOf("await runScheduledNotifications"), "secret check precedes the run");

// ---- Lifecycle routes notify the OTHER party, never the actor ----
const jobs = "app/api/jobs/[id]/";
const cases = [
  ["accept", /accountId: job\.posterId/, /by the driver/],
  ["bid", /accountId: currentJob\.posterId/, /from a driver/],
  ["bids/[bidId]/accept", /accountId: currentBid\.bidderId/, /by the poster/],
  ["confirm-pickup", /accountId: recipientId/, /Pickup confirmed by the \$\{actorRole\}/],
  ["mark-delivered", /accountId: recipientId/, /Delivery marked by the \$\{actorRole\} - please confirm/],
  ["confirm-delivered", /accountId: recipientId/, /Delivery confirmed by the \$\{actorRole\}/],
  ["reject-delivered", /accountId: recipientId/, /Delivery disputed by the \$\{actorRole\}/],
  ["cancel", /accountId: job\.acceptedById/, /cancelled by the poster/],
  ["driver-cancel", /accountId: job\.posterId/, /driver backed out/],
  ["unassign", /accountId: previousDriverId/, /by the poster/],
  ["incidents", /accountId: targetAccountId/, /Incident reported by the \$\{reporterRole\}/],
  ["incidents/updates", /accountId: targetAccountId/, /Incident updated by the \$\{actorRole\}/],
  ["incidents/terminate", /accountId: recipientId/, /terminated by the \$\{actorRole\}/],
];
for (const [name, recipient, wording] of cases) {
  const text = source(`${jobs}${name}/route.ts`);
  assert.match(text, /import \{ notify \} from "@\/lib\/notify"/, `${name} must import notify`);
  assert.match(text, /await notify\(tx, \{/, `${name} must call notify() in its transaction`);
  assert.doesNotMatch(text, /tx\.notification\.(create|upsert)\(/, `${name} must not bypass notify()`);
  assert.match(text, recipient, `${name} must address the other party`);
  assert.match(text, wording, `${name} must say who acted`);
  // Actor guard: the recipient is compared with the actor, or the recipient is a fixed other role.
  const fixedOther = ["accept", "bid", "bids/[bidId]/accept", "cancel", "driver-cancel", "unassign"].includes(name);
  if (!fixedOther) assert.match(text, /!== accountId/, `${name} must never notify the actor`);
}
for (const name of ["confirm-pickup", "mark-delivered", "confirm-delivered", "reject-delivered", "incidents/updates", "incidents/terminate"]) {
  assert.match(source(`${jobs}${name}/route.ts`), /job\.posterId === accountId \? "poster" : "driver"/, `${name} must derive the actor role`);
}
assert.match(source(`${jobs}mark-delivered/route.ts`), /please confirm/i);

// ---- Matching-job alerts ----
const posted = source("app/api/jobs/route.ts");
assert.match(posted, /notifyMatchingDrivers\(prisma, job, account\)/);
assert.match(posted, /catch \(error\) \{\s*console\.error\("Job match notifications failed\./, "match failure must not fail job creation");
assert.ok(posted.indexOf("notifyMatchingDrivers(") > posted.indexOf("return createdJob;"), "alerts run after the job transaction");
const match = source("lib/jobMatchNotifications.ts");
for (const needle of ["id: { not: job.posterId }", "verificationStatus: \"verified\"", "deletionRequestedAt: null", "country: poster.country", "isJobSuitableForDriver", "getDriveAccess", "job-match:${job.id}:${candidate.id}", "JOB_MATCH_NOTIFICATION_CAP = 200"]) {
  assert.ok(match.includes(needle), `job match must include ${needle}`);
}

console.log("Notifications contract passed.");
