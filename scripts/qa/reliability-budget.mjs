#!/usr/bin/env node
import assert from "node:assert/strict";

const TARGET_FAILURE_PROBABILITY = 1 / 1_000_000;
const COMPARISON_FAILURE_PROBABILITY = 1 / 100_000;
const CONFIDENCE = 0.95;
const ALPHA = 1 - CONFIDENCE;

// Exact one-sided Clopper–Pearson upper bound when zero failures are observed.
// This is useful only when trials are independent and representative.
function zeroFailureUpperBound(n, alpha = ALPHA) {
  if (!Number.isSafeInteger(n) || n < 1) {
    throw new RangeError("n must be a positive safe integer");
  }
  if (!(alpha > 0 && alpha < 1)) {
    throw new RangeError("alpha must be between 0 and 1");
  }
  return 1 - alpha ** (1 / n);
}

function zeroFailureTrialsForUpperBound(target, alpha = ALPHA) {
  if (!(target > 0 && target < 1)) {
    throw new RangeError("target must be between 0 and 1");
  }
  if (!(alpha > 0 && alpha < 1)) {
    throw new RangeError("alpha must be between 0 and 1");
  }
  return Math.ceil(Math.log(alpha) / Math.log(1 - target));
}

assert.equal(zeroFailureTrialsForUpperBound(TARGET_FAILURE_PROBABILITY), 2_995_731);
assert.equal(zeroFailureTrialsForUpperBound(COMPARISON_FAILURE_PROBABILITY), 299_572);
assert.ok(zeroFailureUpperBound(5_299) > TARGET_FAILURE_PROBABILITY);
assert.ok(zeroFailureUpperBound(1_000_000) > TARGET_FAILURE_PROBABILITY);
assert.ok(zeroFailureUpperBound(2_995_731) <= TARGET_FAILURE_PROBABILITY);
assert.ok(zeroFailureUpperBound(299_572) <= COMPARISON_FAILURE_PROBABILITY);
assert.ok(zeroFailureUpperBound(299_571) > COMPARISON_FAILURE_PROBABILITY);
assert.ok(zeroFailureUpperBound(2_995_730) > TARGET_FAILURE_PROBABILITY);

// Denominators are transcribed from the final successful GB/IN campaign runs.
// Pooled rows are mathematical illustrations only; see
// docs/QA_STATISTICAL_REPORT_2026-10-17.md for the independence caveats.
const sampleSizes = [
  { label: "Single synthetic-account run", n: 10_000, expectedPpm: 299.53 },
  { label: "Single API-load run", n: 14_000, expectedPpm: 213.96 },
  { label: "Single workflow/E2E run", n: 14_957, expectedPpm: 200.27 },
  { label: "GB + IN API-load pooled illustration", n: 28_000, expectedPpm: 106.98 },
  { label: "GB + IN workflow/E2E pooled illustration", n: 29_914, expectedPpm: 100.14 },
  { label: "All API-load + workflow checks pooled illustration", n: 57_914, expectedPpm: 51.73 },
];

for (const sample of sampleSizes) {
  const ppm = zeroFailureUpperBound(sample.n) * 1_000_000;
  assert.ok(
    Math.abs(ppm - sample.expectedPpm) < 0.02,
    `${sample.label}: confidence-bound calculation drifted (${ppm} ppm)`,
  );
}

console.log("Reliability confidence method: one-sided exact binomial upper bound");
console.log("Confidence level: 95%; observed failures for the displayed bounds: zero");
console.log("Illustrative campaign sample bounds (ppm = upper-bound failures per million):");
for (const sample of sampleSizes) {
  const ppm = zeroFailureUpperBound(sample.n) * 1_000_000;
  console.log(`- ${sample.label}: n=${sample.n.toLocaleString("en-GB")}, upper bound=${ppm.toFixed(2)} ppm`);
}
console.log(`Zero-failure trials required for 1 per 100,000 target: ${zeroFailureTrialsForUpperBound(COMPARISON_FAILURE_PROBABILITY).toLocaleString("en-GB")}`);
console.log(`Zero-failure trials required for 1 per 1,000,000 target: ${zeroFailureTrialsForUpperBound(TARGET_FAILURE_PROBABILITY).toLocaleString("en-GB")}`);
console.log("Caution: pooled bounds are illustrations, not production reliability claims; heterogeneous and correlated QA checks are not independent representative trials.");
console.log("Reliability budget calculations: PASS");
