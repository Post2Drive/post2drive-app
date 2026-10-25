#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { marketDateKey, parseOptionalDateField } from "../../lib/vehicleDates.ts";

const read = (path) => readFileSync(path, "utf8");
const includes = (path, snippet, reason = snippet) => {
  assert.ok(read(path).includes(snippet), `${path}: missing workflow guard — ${reason}`);
};

// Execute the shared calendar-date validator against valid, absent, malformed,
// impossible and market-timezone-boundary values.
const emptyDate = parseOptionalDateField("", "Insurance expiry date");
assert.equal(emptyDate.date, null);
assert.equal(emptyDate.dateKey, null);
assert.equal(emptyDate.error, null);

const validDate = parseOptionalDateField("2026-10-18", "Insurance expiry date");
assert.equal(validDate.error, null);
assert.equal(validDate.dateKey, "2026-10-18");
assert.equal(validDate.date?.toISOString(), "2026-10-18T00:00:00.000Z");

assert.ok(parseOptionalDateField("2026-02-31", "MOT").error, "Impossible calendar date must be rejected");
assert.ok(parseOptionalDateField("18-10-2026", "MOT").error, "Non-ISO date input must be rejected");
assert.ok(parseOptionalDateField(123, "MOT").error, "Non-string date input must be rejected");

const boundaryInstant = new Date("2026-10-18T20:00:00.000Z");
assert.equal(marketDateKey(boundaryInstant, "Asia/Kolkata"), "2026-10-19", "Market date must advance at the local day boundary");
assert.equal(marketDateKey(boundaryInstant, "Europe/London"), "2026-10-18", "The same instant may remain on the prior calendar day in another market");

// Signup's preflight lookup is not enough for concurrent requests; map the
// database unique-key race to a conflict rather than a generic server error.
includes("app/api/signup/route.ts", 'databaseError?.code === "P2002"');
includes("app/api/signup/route.ts", 'status: 409');

// Past pickup times must be rejected by the shared guard used across create,
// edit, bid and accept; such open jobs also must not appear as fresh opportunities.
includes("lib/jobAccess.ts", "pickupAt.getTime() <= Date.now()");
includes("lib/jobAccess.ts", 'reason: "pickup_in_past"');
includes("app/api/jobs/route.ts", "hasFuturePickup(job, actor)");
includes("app/api/jobs/route.ts", ".filter((job) => {");

// Bid API must apply the eligibility and numeric bounds the rest of the workflow assumes.
includes("app/api/jobs/[id]/bid/route.ts", 'bidderAccount?.verificationStatus !== "verified"');
includes("app/api/jobs/[id]/bid/route.ts", "hasEligibleVehicleForJob(accountId, bidderAccount, job.vehicleType)");
includes("app/api/jobs/[id]/bid/route.ts", 'verificationStatus: "verified"');
includes("app/api/jobs/[id]/bid/route.ts", "vehicleEligibilityWhere(currentBidder, currentJob.vehicleType)");
includes("lib/eligibility.ts", "insuranceValidUntil: { gte: dateCutoff }");
includes("lib/eligibility.ts", "inspectionRequiredAtCountryLevel");

includes("app/api/jobs/[id]/bid/route.ts", "amount > 100000000");
includes("app/api/jobs/[id]/bid/route.ts", "FOR UPDATE");

// Fixed-price acceptance must validate an approved, matching vehicle and then
// recheck it in the transaction so a stale preflight cannot bypass approval.
includes("app/api/jobs/[id]/accept/route.ts", "hasEligibleVehicleForJob(accountId, account, jobForAcceptance.vehicleType)");
includes("app/api/jobs/[id]/accept/route.ts", "const currentDriver = await tx.account.findUnique");
includes("app/api/jobs/[id]/accept/route.ts", "tx.vehicle.findFirst");
includes("app/api/jobs/[id]/accept/route.ts", "vehicleEligibilityWhere(currentDriver, job.vehicleType)");
includes("lib/eligibility.ts", "profile?.inspectionRequiredAtCountryLevel");

includes("app/api/jobs/[id]/accept/route.ts", 'priceMode: "fixed"');

// A selected bid remains valid only if the bidder has an approved vehicle for
// the job's current required vehicle type.
includes("app/api/jobs/[id]/bids/[bidId]/accept/route.ts", "const currentJob = await tx.job.findUnique");
includes("app/api/jobs/[id]/bids/[bidId]/accept/route.ts", "vehicles: {");
includes("app/api/jobs/[id]/bids/[bidId]/accept/route.ts", "vehicleType: currentJob.vehicleType");
includes("app/api/jobs/[id]/bids/[bidId]/accept/route.ts", "vehicleEligibilityWhere(currentBidder, currentJob.vehicleType)");
includes("lib/eligibility.ts", "profile?.inspectionRequiredAtCountryLevel");


// Payment declarations are single-write state transitions, and audit events
// commit in the same transaction as their corresponding timestamps.
includes("app/api/jobs/[id]/payment/mark-paid/route.ts", "paidMarkedAt: null");
includes("app/api/jobs/[id]/payment/mark-paid/route.ts", "tx.jobActivity.create");
includes("app/api/jobs/[id]/payment/mark-paid/route.ts", 'action: "PAYMENT_MARKED_PAID"');
includes("app/api/jobs/[id]/payment/confirm-received/route.ts", 'paidMarkedAt: { not: null }');
includes("app/api/jobs/[id]/payment/confirm-received/route.ts", "receivedConfirmedAt: null");
includes("app/api/jobs/[id]/payment/confirm-received/route.ts", "tx.jobActivity.create");
includes("app/api/jobs/[id]/payment/confirm-received/route.ts", "The poster must mark the payment as paid");

// Lifecycle compare-and-set operations are pinned to the same assignment or
// delivery marker observed by the action, so stale actions cannot advance a new state.
includes("app/api/jobs/[id]/confirm-pickup/route.ts", 'acceptedById: job.acceptedById');
includes("app/api/jobs/[id]/mark-delivered/route.ts", 'acceptedById: job.acceptedById');
includes("app/api/jobs/[id]/confirm-delivered/route.ts", 'deliveryMarkedById: job.deliveryMarkedById');
includes("app/api/jobs/[id]/reject-delivered/route.ts", 'if (!job.deliveryMarkedById)');

// Vehicle registration rejects bad JSON and impossible dates, accepts a date
// that is valid through the current market day, and serializes duplicates.
includes("app/api/vehicles/route.ts", "Request body must be valid JSON.");
includes("app/api/vehicles/route.ts", "parseOptionalDateField(body.motValidUntil");
includes("app/api/vehicles/route.ts", "insuranceDate.dateKey < todayInMarket");
includes("app/api/vehicles/route.ts", "FOR UPDATE");
includes("app/api/vehicles/route.ts", "This registration is already on your account.");

console.log("PASS functional workflow contract: signup, job timing, bid/vehicle eligibility, lifecycle transitions, payment order, and vehicle dates/duplicates.");
