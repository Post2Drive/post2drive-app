#!/usr/bin/env node
// Run with: node --experimental-strip-types scripts/qa/vehicle-approval-fleet-contract.mjs
// EXECUTION_PLAN §6 + the 0.50 additional-vehicle fee (§5). Pure-rule tests execute
// lib/vehicleApproval.ts and lib/driverLicence.ts; route wiring is checked at source level.
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";
import { register } from "node:module";

const read = (path) => readFileSync(new URL(`../../${path}`, import.meta.url), "utf8");
const rules = await import("../../lib/vehicleApproval.ts");
const licence = await import("../../lib/driverLicence.ts");

const now = new Date("2026-11-06T12:00:00.000Z");
const future = new Date("2027-06-01T00:00:00.000Z");
const vehicle = (overrides = {}) => ({
  v5cDocumentUrl: "https://docs.example/v5c.pdf",
  insuranceDocumentUrl: "https://docs.example/ins.pdf",
  insuranceValidUntil: future,
  registeredKeeperType: "individual",
  registeredKeeperName: "Sam Driver",
  leaseAgreementUrl: null,
  insurancePolicyholderName: "Sam Driver",
  insuranceCoverType: "hire_and_reward",
  ...overrides,
});
const individual = { companyName: "Sam Driver", planType: "individual", fleetVehicleCount: 1, hasDriverIdentity: true, inspectionRequired: false };
const fleet = { companyName: "Acme Haulage Limited", planType: "fleet", fleetVehicleCount: 5, hasDriverIdentity: false, inspectionRequired: false };
const fleetVehicle = (overrides = {}) => vehicle({
  registeredKeeperType: "company", registeredKeeperName: "ACME HAULAGE LTD",
  insurancePolicyholderName: "Acme Haulage Ltd.", insuranceCoverType: "fleet", ...overrides,
});

// ---- Individual approval rules ----
assert.deepEqual(rules.vehicleApprovalProblems(vehicle(), individual, 1, now), [], "complete individual vehicle with H&R cover is approvable");
assert.ok(rules.vehicleApprovalProblems(vehicle({ insuranceCoverType: "other" }), individual, 1, now).some((p) => /Commercial cover/.test(p)),
  "social/other cover must block approval");
assert.ok(rules.vehicleApprovalProblems(vehicle({ insuranceCoverType: null }), individual, 1, now).some((p) => /Commercial cover/.test(p)),
  "missing cover type must block approval");
assert.deepEqual(rules.vehicleApprovalProblems(vehicle({ insuranceCoverType: "fleet" }), individual, 1, now), [], "fleet cover is commercial cover");
assert.ok(rules.vehicleApprovalProblems(vehicle({ v5cDocumentUrl: null }), individual, 1, now).length > 0, "registration document required");
assert.ok(rules.vehicleApprovalProblems(vehicle({ insuranceValidUntil: new Date("2026-01-01") }), individual, 1, now).length > 0, "expired insurance blocks approval");
assert.ok(rules.vehicleApprovalProblems(vehicle({ registeredKeeperName: " " }), individual, 1, now).length > 0, "keeper name required");
assert.ok(rules.vehicleApprovalProblems(vehicle(), { ...individual, hasDriverIdentity: false }, 1, now).some((p) => /licence/.test(p)),
  "individual driver needs a recorded licence before approval");

// ---- Fleet approval rules ----
assert.equal(rules.isFleetAccount({ planType: "individual", fleetVehicleCount: 1 }, 1), false);
assert.equal(rules.isFleetAccount({ planType: "fleet", fleetVehicleCount: 2 }, 0), true);
assert.equal(rules.isFleetAccount({ planType: "individual", fleetVehicleCount: 1 }, 2), true, "2+ registered vehicles makes a fleet");
assert.deepEqual(rules.vehicleApprovalProblems(fleetVehicle(), fleet, 3, now), [], "company keeper + company policyholder approvable (name normalised)");
assert.ok(rules.vehicleApprovalProblems(fleetVehicle({ registeredKeeperType: "individual", registeredKeeperName: "Joe Bloggs" }), fleet, 3, now)
  .some((p) => /kept by the company/.test(p)), "fleet: individual keeper without lease is rejected");
assert.deepEqual(rules.vehicleApprovalProblems(fleetVehicle({ registeredKeeperType: "individual", registeredKeeperName: "Lease Co", leaseAgreementUrl: "https://docs.example/lease.pdf" }), fleet, 3, now), [],
  "fleet: lease agreement substitutes for company keeper");
assert.ok(rules.vehicleApprovalProblems(fleetVehicle({ registeredKeeperName: "Other Haulage Ltd" }), fleet, 3, now).some((p) => /kept by the company/.test(p)),
  "fleet: company keeper must be THIS company");
assert.ok(rules.vehicleApprovalProblems(fleetVehicle({ insurancePolicyholderName: "Joe Bloggs" }), fleet, 3, now).some((p) => /held by the company/.test(p)),
  "fleet: policyholder must be the company");
assert.ok(rules.vehicleApprovalProblems(fleetVehicle({ insuranceCoverType: "other" }), fleet, 3, now).some((p) => /Commercial cover/.test(p)),
  "fleet: commercial cover still required");

// ---- Insurance reviewed once per policy ----
assert.equal(rules.insurancePolicyKey("Acme Haulage Limited", "pol-123 / 45"), rules.insurancePolicyKey("ACME HAULAGE LTD", "POL12345"));
assert.notEqual(rules.insurancePolicyKey("Acme Haulage Ltd", "POL1"), rules.insurancePolicyKey("Acme Haulage Ltd", "POL2"));
assert.equal(rules.insurancePolicyKey("Acme", ""), null, "no policy number = no shared review");

// ---- Correction windows (§5) ----
const first = rules.vehicleCorrectionDeadline(1, new Date("2026-11-06T12:00:00Z")); // Friday
assert.equal(first.toISOString().slice(0, 10), "2026-11-20", "first rejection: 10 working days");
const second = rules.vehicleCorrectionDeadline(2, new Date("2026-11-06T12:00:00Z"));
assert.equal(second.toISOString().slice(0, 10), "2026-11-11", "second rejection: final 3 working days");
assert.equal(rules.vehicleCorrectionDeadline(3, now), null, "after the final window a new attempt needs a new fee");

// ---- Licence hashing and uniqueness ----
assert.equal(rules.normaliseLicenceNumber("morga 657054 sm9ij"), "MORGA657054SM9IJ");
assert.equal(rules.normaliseLicenceNumber("ab"), null);
assert.equal(rules.normaliseLicenceNumber("<script>"), null);
const secret = "x".repeat(32);
const a = licence.hashLicenceNumber("MORGA657054SM9IJ", secret);
assert.match(a, /^[a-f0-9]{64}$/);
assert.equal(a, licence.hashLicenceNumber(rules.normaliseLicenceNumber("MORGA-657054-SM9IJ"), secret), "same licence -> same hash (uniqueness key)");
assert.notEqual(a, licence.hashLicenceNumber("MORGA657054SM9IJ", "y".repeat(32)), "hash is keyed by the server secret");
assert.ok(!a.includes("MORGA"), "hash must not contain the licence");
assert.equal(licence.licenceLast4("MORGA657054SM9IJ"), "M9IJ");
assert.equal(licence.licenceHashSecret({ NODE_ENV: "production", NEXTAUTH_SECRET: secret }), null, "production fails closed without the dedicated secret");
assert.equal(licence.licenceHashSecret({ NODE_ENV: "production", POST2DRIVE_LICENCE_HASH_SECRET: "short" }), null, "short secrets rejected");
assert.equal(licence.licenceHashSecret({ NODE_ENV: "development", NEXTAUTH_SECRET: secret }), secret, "non-production may fall back like the OTP pepper");
assert.doesNotMatch(licence.LICENCE_NOT_ACCEPTED_MESSAGE, /another account|already (registered|used)/i, "duplicate message must not reveal account existence");

const schema = read("prisma/schema.prisma");
const driverIdentity = schema.match(/model DriverIdentity \{[\s\S]*?\n\}/)?.[0] ?? "";
assert.match(driverIdentity, /licenceHash\s+String @unique/, "licence hash unique across accounts");
assert.match(driverIdentity, /accountId String\s+@unique/, "one driver identity per account");
assert.doesNotMatch(schema, /licenceNumber\s+String/, "plain licence numbers are never stored");
const migration = read("prisma/migrations/20261106040000_vehicle_approval_fleet_rules/migration.sql");
assert.match(migration, /CREATE UNIQUE INDEX "DriverIdentity_licenceHash_key"/);
assert.match(migration, /CREATE UNIQUE INDEX "JobDriverAssignment_jobId_key"/);

const driverRoute = read("app/api/account/driver-licence/route.ts");
assert.match(driverRoute, /licenceHashSecret\(\)/);
assert.match(driverRoute, /if \(!secret\)[\s\S]{0,200}status: 503/, "missing secret fails closed");
assert.match(driverRoute, /LICENCE_NOT_ACCEPTED_MESSAGE[\s\S]{0,80}status: 409/, "duplicate licence -> neutral 409");
assert.match(driverRoute, /enforceRateLimit/, "licence submission is rate limited");
assert.doesNotMatch(driverRoute, /licenceHash:\s*true[\s\S]{0,40}NextResponse/, "hash is never returned");

// ---- Fleet driver record required on accept / bid / bid-accept ----
assert.equal(rules.parseFleetDriverInput({}).ok, false);
assert.equal(rules.parseFleetDriverInput({ driverName: "Jo Smith", driverLicenceNumber: "ab", vehicleId: "v1" }).ok, false);
const parsed = rules.parseFleetDriverInput({ driverName: "  Jo   Smith ", driverLicenceNumber: "smith 711 13 jo9ab", vehicleId: "veh_1" });
assert.deepEqual(parsed, { ok: true, value: { driverName: "Jo Smith", licence: "SMITH71113JO9AB", vehicleId: "veh_1" } });

const driverAssignment = read("lib/jobDriverAssignment.ts");
assert.match(driverAssignment, /isFleetAccount\(/, "fleet detection drives the requirement");
assert.match(driverAssignment, /parseFleetDriverInput\(/);
assert.match(driverAssignment, /vehicleEligibilityWhere\(/, "declared vehicle must be an eligible vehicle of this account");
assert.match(driverAssignment, /accountId,[\s\S]{0,40}id: /, "vehicle lookup is scoped to the accepting account");

const accept = read("app/api/jobs/[id]/accept/route.ts");
assert.match(accept, /readBoundedText\(req, 4 \* 1024\)/, "accept reads a bounded (optional) driver declaration");
assert.match(accept, /resolveJobDriverAssignment\(/);
assert.match(accept, /tx\.jobDriverAssignment\.upsert/, "accept records the driver inside the claim transaction");
const bid = read("app/api/jobs/[id]/bid/route.ts");
assert.match(bid, /resolveJobDriverAssignment\(/, "fleet bids declare driver + vehicle");
assert.match(bid, /fleetDriverLicenceHash/);
const bidAccept = read("app/api/jobs/[id]/bids/[bidId]/accept/route.ts");
assert.match(bidAccept, /tx\.jobDriverAssignment\.upsert/, "bid award records the driver");
assert.match(bidAccept, /BID_DRIVER_RECORD_MISSING/, "fleet bid without a declared driver cannot be awarded");

// ---- Poster sees driver record only after acceptance ----
const record = { driverName: "Jo Smith", licenceLast4: "O9AB", vehicleRegPlate: "AB12 CDE", licenceHash: "secret-hash" };
const matched = { status: "accepted", posterId: "poster", acceptedById: "fleet" };
assert.deepEqual(rules.driverRecordView(record, matched, "poster"), { driverName: "Jo Smith", licenceLast4: "O9AB", vehicleRegPlate: "AB12 CDE" });
assert.equal(rules.driverRecordView(record, { ...matched, status: "open" }, "poster"), null, "not before acceptance");
assert.equal(rules.driverRecordView(record, { ...matched, status: "cancelled" }, "poster"), null);
assert.equal(rules.driverRecordView(record, matched, "outsider"), null, "never to non-parties");
assert.ok(!("licenceHash" in rules.driverRecordView(record, matched, "poster")), "hash never exposed");
const jobsRoute = read("app/api/jobs/route.ts");
assert.ok(jobsRoute.includes("driverRecord: driverRecordView(job.driverAssignment, job, accountId)"), "jobs list exposes driver record through the view helper only");
assert.ok(jobsRoute.includes("driverAssignment: { select: { driverName: true, licenceLast4: true, vehicleRegPlate: true } }"),
  "jobs list selects only display fields of the assignment");

// ---- 0.50 additional-vehicle fee ----
assert.equal(rules.chargesAdditionalVehicleFee(0, { country: "GB", currency: "GBP" }), false, "first vehicle covered by the 3.50 package");
assert.equal(rules.chargesAdditionalVehicleFee(1, { country: "GB", currency: "GBP" }), true, "2nd vehicle charged");
assert.equal(rules.chargesAdditionalVehicleFee(9, { country: "IE", currency: "EUR" }), true, "every later vehicle charged");
assert.equal(rules.chargesAdditionalVehicleFee(3, { country: "IN", currency: "INR" }), false, "India is fee-free");
const vehiclesRoute = read("app/api/vehicles/route.ts");
const verificationSource = read("lib/verification.ts");
assert.match(verificationSource, /export async function recordVehicleAddedFees/, "vehicle fees live in the shared verification fee module");
assert.match(verificationSource, /code: "additionalVehicle", quantity: 1/, "extra vehicles are charged the additionalVehicle line (amount from lib/pricing.ts)");
assert.match(verificationSource, /idempotencyKey: `vehicle-added:\$\{vehicleId\}`/, "one fee per vehicle, idempotent");
assert.match(vehiclesRoute, /recordVehicleAddedFees\(tx, account, created\.id\)/, "vehicle fees go through the shared pending-fee helper in the create transaction");
assert.doesNotMatch(vehiclesRoute, /status: "paid"/, "the vehicles route never marks a fee paid");
assert.match(vehiclesRoute, /insuranceCoverType/);
assert.match(vehiclesRoute, /registeredKeeperType/);
assert.match(vehiclesRoute, /async function PATCHHandler/);

// ---- Admin-only access ----
const adminRoute = read("app/api/admin/vehicles/route.ts");
assert.match(adminRoute, /if \(!session\)[\s\S]{0,120}status: 401/);
assert.match(adminRoute, /if \(!\(await isTesterAdmin\(\)\)\)[\s\S]{0,120}status: 403/, "non-admins get 403");
assert.equal((adminRoute.match(/isTesterAdmin\(\)/g) || []).length >= 2, true, "GET and POST both check admin");
assert.match(adminRoute, /enforceRateLimit/);
assert.match(adminRoute, /readBoundedJson\(/);
assert.match(adminRoute, /vehicleApprovalProblems\(/, "approval rules enforced server-side");
assert.match(adminRoute, /tx\.adminAuditEvent\.create/);
assert.match(adminRoute, /tx\.notification\.create/, "account is notified");
assert.match(adminRoute, /verificationStatus: "verified"[\s\S]{0,80}verifiedAt: now/, "approval sets verified + verifiedAt");
assert.match(adminRoute, /withApiMetrics\("\/api\/admin\/vehicles", GETHandler\)/);
assert.match(adminRoute, /withApiMetrics\("\/api\/admin\/vehicles", POSTHandler\)/);
assert.ok(existsSync(new URL("../../app/admin/vehicles/page.tsx", import.meta.url)), "admin review page exists");


// =========================================================================
// Review fixes (PR #177 review, integration branch). Items 1-7 and nits.
// =========================================================================
// Load lib/jobDriverAssignment.ts with the "@/" alias and a Prisma stub (no DB here).
const root = new URL("../../", import.meta.url).href;
register(`data:text/javascript,${encodeURIComponent(`
  export async function resolve(specifier, context, next) {
    if (specifier === "@/lib/prisma") return { url: "data:text/javascript,export const prisma = {};", shortCircuit: true };
    if (specifier.startsWith("@/")) return next(${JSON.stringify(root)} + specifier.slice(2) + ".ts", context);
    return next(specifier, context);
  }`)}`);
process.env.POST2DRIVE_LICENCE_HASH_SECRET ||= "contract-only-secret-".padEnd(40, "x");
const assignment = await import("../../lib/jobDriverAssignment.ts");
const stripComments = (src) => src.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

// ---- 1. Fleet rules bypass: approved as individual, then a 2nd vehicle is added ----
const soleVehicle = { id: "v1", regPlate: "AB12 CDE", verificationStatus: "verified", rejectionCount: 0, ...vehicle() };
const acme = { companyName: "Acme Haulage Ltd", planType: "individual", fleetVehicleCount: null };
assert.deepEqual(rules.vehiclesFailingFleetRevalidation(acme, [soleVehicle]), [], "1 vehicle: still an individual, nothing re-checked");
const afterSecond = rules.vehiclesFailingFleetRevalidation(acme, [soleVehicle, { ...soleVehicle, id: "v2", verificationStatus: "pending" }]);
assert.deepEqual(afterSecond.map((entry) => entry.vehicle.id), ["v1"], "2nd vehicle makes a fleet: the earlier individually-approved vehicle fails fleet rules");
assert.ok(afterSecond[0].problems.some((p) => /kept by the company/.test(p)) && afterSecond[0].problems.some((p) => /held by the company/.test(p)));
assert.deepEqual(rules.vehiclesFailingFleetRevalidation(acme, [
  { ...soleVehicle, ...fleetVehicle({ registeredKeeperName: "Acme Haulage Ltd", insurancePolicyholderName: "Acme Haulage Ltd" }) },
  { ...soleVehicle, id: "v2" },
].map((v, n) => ({ ...v, id: "c" + n, verificationStatus: "verified" }))).map((e) => e.vehicle.id), ["c1"], "only non-compliant verified vehicles are moved");

// Execute revalidateFleetVehicles against an in-memory transaction.
const memory = { updates: [], notifications: [], audits: [] };
const fakeTx = {
  account: { findUnique: async () => ({ id: "acct", ...acme }) },
  vehicle: {
    findMany: async () => [soleVehicle, { ...soleVehicle, id: "v2", verificationStatus: "pending" }],
    update: async (args) => { memory.updates.push(args); return {}; },
  },
  notification: { create: async (args) => { memory.notifications.push(args); return {}; } },
  adminAuditEvent: { create: async (args) => { memory.audits.push(args); return {}; } },
};
const moved = await assignment.revalidateFleetVehicles(fakeTx, "acct", "system:test", new Date("2026-11-06T12:00:00Z"));
assert.deepEqual(moved, ["v1"]);
assert.equal(memory.updates[0].data.verificationStatus, "failed", "non-compliant vehicle leaves verified");
assert.equal(memory.updates[0].data.verifiedAt, null);
assert.equal(memory.updates[0].data.correctionDeadline.toISOString().slice(0, 10), "2026-11-20", "§5 correction window applies (10 working days)");
assert.match(memory.updates[0].data.rejectionReason, /now a fleet/);
assert.equal(memory.notifications.length, 1, "owner is notified");
assert.equal(memory.audits[0].data.action, "VEHICLE_FLEET_REVALIDATION_FAILED", "change is audited");
const vehiclesSrc = stripComments(read("app/api/vehicles/route.ts"));
assert.match(vehiclesSrc, /recordVehicleAddedFees\(tx, account, created\.id\);\s*await revalidateFleetVehicles\(tx, account\.id,/,
  "adding a vehicle re-validates verified vehicles in the same transaction");
const adminSrc = stripComments(read("app/api/admin/vehicles/route.ts"));
assert.match(adminSrc, /revalidateFleetVehicles\(tx, account\.id, reviewer, now\)/, "approval also re-validates on current account state (legacy fleets)");
assert.match(adminSrc, /account\._count\.vehicles,\s*now,/, "approval rules use the current registered vehicle count");

// ---- 2. One fleet definition everywhere, including legacy fleetVehicleCount null ----
assert.equal(rules.isFleetAccount({ planType: "individual", fleetVehicleCount: null }, 2), true, "legacy account with 2 vehicles is a fleet");
assert.equal(rules.isFleetAccount({ planType: "individual", fleetVehicleCount: null }, 1), false);
assert.equal(rules.isFleetAccount({ planType: "fleet", fleetVehicleCount: null }, 0), true);
const counted = await assignment.loadFleetStatus({ vehicle: { count: async ({ where }) => (where.accountId === "legacy" ? 3 : 0) } },
  { id: "legacy", planType: "individual", fleetVehicleCount: null });
assert.deepEqual(counted, { fleet: true, registeredVehicleCount: 3 }, "loader counts registered vehicles");
assert.deepEqual(assignment.parseDriverDeclaration({ fleet: true }, {}).ok, false, "fleet status from the loader requires a declaration");
assert.deepEqual(assignment.parseDriverDeclaration({ fleet: false }, {}), { ok: true, value: { fleet: false } });
const routeSources = {
  accept: stripComments(read("app/api/jobs/[id]/accept/route.ts")),
  bid: stripComments(read("app/api/jobs/[id]/bid/route.ts")),
  bidAccept: stripComments(read("app/api/jobs/[id]/bids/[bidId]/accept/route.ts")),
  vehicles: vehiclesSrc,
  admin: adminSrc,
};
for (const [name, src] of Object.entries(routeSources)) {
  assert.doesNotMatch(src, /isFleetAccount\([^,()]*\)/, name + ": isFleetAccount must always receive the registered vehicle count");
}
for (const name of ["accept", "bid", "bidAccept"]) {
  assert.match(routeSources[name], /loadFleetStatus\(/, name + ": fleet status comes from the shared loader");
}
assert.doesNotMatch(routeSources.bidAccept, /bidderPlan/, "bid award no longer uses a plan-only fleet check");

// ---- 3. Fleet-declared licence must not belong to another account's driver ----
const declared = assignment.parseDriverDeclaration({ fleet: true }, { driverName: "Jo Smith", driverLicenceNumber: "SMITH71113JO9AB", vehicleId: "veh_1" });
assert.equal(declared.ok, true);
const assignmentDb = (identityOwner) => ({
  driverIdentity: { findUnique: async () => (identityOwner ? { accountId: identityOwner } : null) },
  vehicle: { findFirst: async () => ({ id: "veh_1", regPlate: "AB12 CDE", vehicleType: "van" }) },
  user: { findFirst: async () => null },
});
const assignArgs = { accountId: "fleet-acct", declaration: declared.value, vehicleType: "van", market: { country: "GB", currency: "GBP" }, requireEligibleVehicle: false };
await assert.rejects(assignment.resolveJobDriverAssignment(assignmentDb("other-acct"), assignArgs), /DRIVER_LICENCE_NOT_ACCEPTED/,
  "licence registered to another account's driver is refused");
assert.equal((await assignment.resolveJobDriverAssignment(assignmentDb(null), assignArgs)).source, "fleet_declared", "unregistered licence is accepted");
assert.equal((await assignment.resolveJobDriverAssignment(assignmentDb("fleet-acct"), assignArgs)).source, "fleet_declared", "the fleet's own registered driver is accepted");
assert.doesNotMatch(assignment.FLEET_LICENCE_NOT_ACCEPTED, /another account|already|registered/i, "neutral wording");
for (const name of ["accept", "bid"]) {
  assert.match(routeSources[name], /DRIVER_LICENCE_NOT_ACCEPTED[\s\S]{0,120}FLEET_LICENCE_NOT_ACCEPTED[\s\S]{0,40}status: 409/, name + ": neutral 409");
}
assert.match(routeSources.bidAccept, /DRIVER_LICENCE_NOT_ACCEPTED"\)\) throw new Error\("BID_NO_LONGER_ELIGIBLE"\)/, "bid award re-checks the licence");

// ---- 4. Licence claim abuse ----
const licenceRoute = stripComments(read("app/api/account/driver-licence/route.ts"));
const postBody = licenceRoute.slice(licenceRoute.indexOf("async function POSTHandler"));
const at = (needle) => { const i = postBody.indexOf(needle); assert.ok(i >= 0, "missing: " + needle); return i; };
assert.ok(at('account.verificationStatus !== "verified"') < at("enforceRateLimit("), "person ID must be verified before a licence can be claimed");
assert.ok(at("enforceRateLimit(") < at("readBoundedJson("), "rate limit counts every attempt, including malformed and refused ones");
assert.ok(at("enforceRateLimit(") < at("driverIdentity.findUnique"), "rate limit is spent before any lookup");
assert.doesNotMatch(postBody, /already recorded for this account/, "no distinguishable 'different licence on this account' message");
assert.equal((postBody.match(/return notAccepted\(\)/g) || []).length, 2, "own-account mismatch and duplicate/storage failure share one response");
assert.match(postBody, /const notAccepted = \(\) => NextResponse\.json\(\{ error: LICENCE_NOT_ACCEPTED_MESSAGE \}, \{ status: 409 \}\)/);
assert.doesNotMatch(postBody, /status: 500/, "storage failures are not distinguishable from duplicates");
const releaseRoute = stripComments(read("app/api/admin/driver-licence/release/route.ts"));
assert.match(releaseRoute, /if \(!session\)[\s\S]{0,120}status: 401/);
assert.match(releaseRoute, /if \(!\(await isTesterAdmin\(\)\)\)[\s\S]{0,120}status: 403/, "release is admin-only");
assert.match(releaseRoute, /action: "DRIVER_LICENCE_RELEASED"/, "release is audited");
assert.match(releaseRoute, /tx\.driverIdentity\.delete/);
assert.match(releaseRoute, /enforceRateLimit/);
assert.doesNotMatch(releaseRoute, /licenceHash[^:]*:\s*true|NextResponse\.json\(\{[^}]*licenceHash/, "release never returns the hash");
assert.match(releaseRoute, /withApiMetrics\("\/api\/admin\/driver-licence\/release", POSTHandler\)/);
assert.match(read("lib/driverLicence.ts"), /admin release route/, "comment matches behaviour");

// ---- 5. MOT expiry checked at approval where the market requires inspection ----
const expiredMot = vehicle({ motValidUntil: new Date("2026-01-01") });
assert.ok(rules.vehicleApprovalProblems(expiredMot, { ...individual, inspectionRequired: true }, 1, now).some((p) => /MOT/.test(p)), "expired MOT blocks approval");
assert.ok(rules.vehicleApprovalProblems(vehicle({ motValidUntil: null }), { ...individual, inspectionRequired: true }, 1, now).some((p) => /MOT/.test(p)), "missing MOT blocks approval");
assert.deepEqual(rules.vehicleApprovalProblems(vehicle({ motValidUntil: future }), { ...individual, inspectionRequired: true }, 1, now), []);
assert.deepEqual(rules.vehicleApprovalProblems(expiredMot, { ...individual, inspectionRequired: false }, 1, now), [], "markets without inspection are not blocked");
assert.match(adminSrc, /inspectionRequired: Boolean\(getLocalisationProfile\(\{ country: account\.country, currency: account\.currency \}\)\?\.inspectionRequiredAtCountryLevel\)/);

// ---- 6. Pilot QA accounts treated the same at bid and bid award ----
assert.equal(assignment.bidderRequiresEligibleVehicle({ isTester: false }, false, false), true, "real accounts need a vehicle");
assert.equal(assignment.bidderRequiresEligibleVehicle({ isTester: true }, false, false), false, "plain testers exempt");
assert.equal(assignment.bidderRequiresEligibleVehicle({ isTester: true }, true, false), true, "pilot QA outside a staging run needs a vehicle");
assert.equal(assignment.bidderRequiresEligibleVehicle({ isTester: true }, true, true), false, "pilot QA in an enabled staging run exempt");
assert.match(routeSources.bid, /bidderRequiresEligibleVehicle\(bidderAccount, isPilotQaAccount, stagingQaTester\)/);
assert.match(routeSources.bidAccept, /bidderRequiresEligibleVehicle\(currentBidder, bidderIsPilotQa, bidderStagingQa\)/);
assert.match(routeSources.bidAccept, /requireEligibleVehicle: bidderNeedsVehicle/);
assert.doesNotMatch(routeSources.bidAccept, /requireEligibleVehicle: !currentBidder\.isTester/, "bid award no longer exempts every tester");

// ---- 7. India: per-job driver record intentionally not required ----
const acceptRaw = read("app/api/jobs/[id]/accept/route.ts");
assert.match(acceptRaw, /India is intentionally exempt from the per-job driver record/, "documented intentional exemption");
assert.match(routeSources.accept, /isIndiaPhoneVerifiedAccount\(account\)\s*\?\s*\{ ok: true as const, value: \{ fleet: false as const \} \}/,
  "India accepts declare no fleet driver (EXECUTION_PLAN §1: India unchanged)");
assert.match(routeSources.accept, /requireEligibleVehicle: recordsDriverVehicle/);
assert.match(routeSources.accept, /recordsDriverVehicle = [^;]*!isIndiaPhoneVerifiedAccount\(account\)/, "India records no driver/vehicle");

// ---- Nits ----
const patchBody = vehiclesSrc.slice(vehiclesSrc.indexOf("async function PATCHHandler"));
assert.ok(patchBody.indexOf("enforceRateLimit(") > 0 && patchBody.indexOf("enforceRateLimit(") < patchBody.indexOf("readBoundedJson("), "PATCH /api/vehicles is rate limited");
assert.match(adminSrc, /if \(account\.deletionRequestedAt\)[\s\S]{0,140}status: 409/, "admin cannot review vehicles of accounts pending deletion");
const adminPage = stripComments(read("app/admin/vehicles/page.tsx"));
assert.doesNotMatch(adminPage, /aria-describedby/, "no aria-describedby on a disabled (unfocusable) button");
assert.match(adminPage, /Approve is unavailable until the problems listed above are fixed\./, "visible helper text instead");

console.log("Vehicle approval and fleet rules contract passed: approval rules, fleet keeper/policyholder, policy review key, correction windows, licence hashing, fleet driver record, poster visibility, 0.50 fee, admin-only access, review fixes 1-7.");
