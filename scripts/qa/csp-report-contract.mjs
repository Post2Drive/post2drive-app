#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const config = readFileSync("next.config.js", "utf8");
const route = readFileSync("app/api/security/csp-report/route.ts", "utf8");

assert.match(config, /Content-Security-Policy-Report-Only/,
  "CSP remains report-only until compatibility evidence is reviewed");
assert.match(config, /report-uri \/api\/security\/csp-report/,
  "CSP report-only policy must send violations to the bounded report endpoint");
assert.doesNotMatch(config, /script-src[^\n]*unsafe-eval/,
  "Report-only policy must surface eval use rather than allow it silently");
assert.match(route, /readBoundedJson\(request, MAX_REPORT_BYTES\)/,
  "CSP report body must have a strict streaming byte limit");
assert.match(route, /scope: "csp-report"[\s\S]*?limit: 60[\s\S]*?windowMs: 60_000/,
  "CSP report ingestion must be rate limited");
assert.match(route, /blockedUriCategory/,
  "Only a categorized/normalized blocked URI may be logged");
assert.match(route, /console\.warn\("CSP_REPORT", JSON\.stringify\(summary\)\)/,
  "Report logging must use the bounded summary, never the raw request body");
assert.doesNotMatch(route, /console\.(?:log|warn|error)\([^\n]*(?:request\.url|parsed\.value|report\))/,
  "Raw report content must never be logged");

console.log("CSP report endpoint contract passed.");
