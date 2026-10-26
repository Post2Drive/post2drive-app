import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const route = read("../../app/api/jobs/route.ts");
const page = read("../../app/jobs/page.tsx");

// The public jobs response must use an explicit allowlist rather than spread
// the complete Prisma row into a response object.
assert.ok(route.includes("const jobView = {"), "job response must be built from an explicit allowlist");
assert.ok(!route.includes("...jobData") && !route.includes("...jobWithMatchHistory"), "do not spread database rows into API responses");
assert.ok(route.includes("poster: canSeePartyContacts") && route.includes("acceptedBy: job.acceptedBy"), "nested party data must remain behind the contact-visibility policy");
assert.ok(!route.includes("const jobWithMatchHistory = { ...jobData, previousDriverIds }"), "do not serialize job row plus all previous driver IDs");
assert.ok(route.includes("currentUserPreviouslyBackedOut: previousDriverIds.includes(accountId)"));
assert.ok(route.includes("hasPreviousDrivers: previousDriverIds.length > 0"));
assert.ok(route.includes("pickupContactName: canSeePartyContacts ? pickupContactName : null"));
assert.ok(route.includes("pickupContactPhone: canSeePartyContacts ? pickupContactPhone : null"));
assert.ok(route.includes("dropoffContactName: canSeePartyContacts ? dropoffContactName : null"));
assert.ok(route.includes("dropoffContactPhone: canSeePartyContacts ? dropoffContactPhone : null"));
assert.ok(!page.includes("previousDriverIds"), "client should not require other drivers' account IDs");
assert.ok(page.includes("job.currentUserPreviouslyBackedOut"));
assert.ok(page.includes("job.hasPreviousDrivers"));
console.log("Job response data-minimization contract passed.");
