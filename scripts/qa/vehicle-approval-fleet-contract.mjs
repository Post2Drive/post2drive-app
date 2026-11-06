#!/usr/bin/env node
// Run with: node --experimental-strip-types scripts/qa/vehicle-approval-fleet-contract.mjs
// EXECUTION_PLAN §6 + the 0.50 additional-vehicle fee (§5). Pure-rule tests execute
// lib/vehicleApproval.ts and lib/driverLicence.ts; route wiring is checked at source level.
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";

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
const individual = { companyName: "Sam Driver", planType: "individual", fleetVehicleCount: 1, hasDriverIdentity: true };
const fleet = { companyName: "Acme Haulage Limited", planType: "fleet", fleetVehicleCount: 5, hasDriverIdentity: false };
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

console.log("Vehicle approval and fleet rules contract passed: approval rules, fleet keeper/policyholder, policy review key, correction windows, licence hashing, fleet driver record, poster visibility, 0.50 fee, admin-only access.");
