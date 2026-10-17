#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const read = (path) => readFileSync(new URL(path, import.meta.url), "utf8");
const schema = read("../../prisma/schema.prisma");
const migration = read("../../prisma/migrations/20261017120000_dropoff_time_zone/migration.sql");
const validation = read("../../lib/jobValidation.ts");
const createForm = read("../../app/jobs/new/page.tsx");
const editForm = read("../../app/jobs/[id]/edit/page.tsx");
const createRoute = read("../../app/api/jobs/route.ts");
const editRoute = read("../../app/api/jobs/[id]/edit/route.ts");

assert.match(schema, /dropoffTimeZone\s+String\?/);
assert.match(migration, /ALTER TABLE "Job" ADD COLUMN "dropoffTimeZone" TEXT;/);
assert.match(validation, /requestedDropoffTimeZone\s*\|\|\s*pickupTimeZone/);
assert.match(validation, /Choose a drop-off time zone valid for your market/);
assert.match(validation, /pickupTimeZone,\s*dropoffTimeZone,\s*vehicleType/);
assert.match(createForm, /dropoffTimeZone:\s*marketProfile\?\.timeZone/);
assert.match(createForm, /update\("dropoffTimeZone", e\.target\.value\)/);
assert.match(createRoute, /\.\.\.validation\.data/);
assert.match(editForm, /loadedJob\.dropoffTimeZone\s*\|\|\s*loadedJob\.pickupTimeZone/);
assert.match(editForm, /dropoffTimeZone,\s*vehicleType/);
assert.match(editForm, /setDropoffTimeZone\(event\.target\.value\)/);
assert.match(editRoute, /job\.dropoffTimeZone\s*!==\s*data\.dropoffTimeZone/);
assert.match(editRoute, /dropoffTimeZone:\s*data\.dropoffTimeZone/);

console.log(JSON.stringify({
  status: "passed",
  checks: 13,
  coverage: [
    "nullable schema field and forward-only migration",
    "market-validated drop-off zone",
    "legacy job fallback to pickup zone",
    "create/edit UI payload wiring",
    "create/edit API persistence and material-change handling"
  ],
  note: "This structural contract does not prove staging migration application or real browser behavior; those remain separate release gates."
}, null, 2));
