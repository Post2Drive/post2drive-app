import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const route = read("../../app/api/jobs/route.ts");
const page = read("../../app/jobs/page.tsx");

assert.ok(route.includes("const jobView = {"), "job response must be built from an explicit allowlist");
assert.ok(!route.includes("...jobData") && !route.includes("...jobWithMatchHistory"), "do not spread database rows into API responses");
assert.ok(route.includes("poster: canSeePartyContacts") && route.includes("acceptedBy: job.acceptedBy"), "nested party data must remain behind contact visibility policy");
assert.ok(!route.includes("const jobWithMatchHistory = { ...jobData, previousDriverIds }"), "do not serialize job row plus all previous driver IDs");
assert.ok(route.includes("currentUserPreviouslyBackedOut: previousDriverIds.includes(accountId)"));
assert.ok(route.includes("isCurrentUserPoster: job.posterId === accountId") && route.includes("isCurrentUserAcceptedDriver: job.acceptedById === accountId"), "API should return caller-relative role flags instead of account IDs");
assert.ok(!route.includes("      posterId: job.posterId,") && !route.includes("      acceptedById: job.acceptedById,"), "do not serialize job-party account IDs in marketplace responses");
assert.ok(!page.includes("job.posterId") && !page.includes("job.acceptedById") && !page.includes("job.deliveryMarkedById"), "client must use caller-relative flags, not internal account IDs");
assert.ok(route.includes("hasPreviousDrivers: previousDriverIds.length > 0"));
assert.ok(route.includes("const canSeePartyContacts = contactVisibleStatuses.includes(job.status) && isJobParty;"), "party contacts must be limited to matched-job parties in every market");
assert.ok(!/canSeePartyContacts = country ===/.test(route), "no market may expose other users' contacts to non-parties");
assert.ok(route.includes("pickupContactName: canSeePartyContacts ? pickupContactName : null"));
assert.ok(route.includes("pickupContactPhone: canSeePartyContacts ? pickupContactPhone : null"));
assert.ok(route.includes("dropoffContactName: canSeePartyContacts ? dropoffContactName : null"));
assert.ok(route.includes("dropoffContactPhone: canSeePartyContacts ? dropoffContactPhone : null"));
assert.ok(!page.includes("previousDriverIds"), "client should not require other drivers' account IDs");
// Fair rating policy (lib/ratingPolicy.ts): backed-out drivers are not rated, so the page no longer
// needs the caller-relative back-out flags for rating; it must still never use other drivers' IDs.
assert.ok(!/canRate[\s\S]{0,300}currentUserPreviouslyBackedOut/.test(page), "backed-out drivers must not be offered the rating form");
assert.ok(page.includes('href={`/profile/${job.poster.displayId}`}'), "profile links must use the public display ID expected by the profile API");
console.log("Job response data-minimization contract passed.");

const payments = read("../../app/api/payments/route.ts");
assert.ok(payments.includes("crossBorder: false"), "payment history must exclude cross-border jobs");
assert.ok(payments.includes("country: account.country") && payments.includes("currency: account.currency"), "payment history must be scoped to the caller's market");
assert.ok(payments.includes("select: {") && payments.includes("paymentJobSelect"), "payment history must use an explicit response field allowlist");
assert.ok(!payments.includes("include: {"), "payment history must not serialize complete related records");
assert.ok(payments.includes('"Cache-Control": "private, no-store"'), "payment history must not be cached by shared intermediaries");
console.log("Payment history market isolation and data-minimization contract passed.");
