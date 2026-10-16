#!/usr/bin/env node
import assert from "node:assert/strict";

const TARGET_FAILURE_PROBABILITY = 1 / 1_000_000;
const CONFIDENCE = 0.95;
const ALPHA = 1 - CONFIDENCE;

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
assert.ok(zeroFailureUpperBound(5_299) > TARGET_FAILURE_PROBABILITY);
assert.ok(zeroFailureUpperBound(1_000_000) > TARGET_FAILURE_PROBABILITY);
assert.ok(zeroFailureUpperBound(2_995_731) <= TARGET_FAILURE_PROBABILITY);
assert.ok(zeroFailureUpperBound(299_572) <= 1 / 100_000);
assert.ok(zeroFailureUpperBound(299_571) > 1 / 100_000);
assert.ok(zeroFailureUpperBound(2_995_730) > TARGET_FAILURE_PROBABILITY);

console.log("Primary reliability target: <= 1 failure per 1,000,000 representative operations");
console.log("Confidence level: 95% one-sided exact binomial upper bound");
console.log(`Zero-failure trials needed for primary target: ${zeroFailureTrialsForUpperBound(TARGET_FAILURE_PROBABILITY).toLocaleString("en-GB")}`);
console.log(`Zero-failure trials needed for one-per-100,000 comparison target: ${zeroFailureTrialsForUpperBound(1 / 100_000).toLocaleString("en-GB")}`);
console.log(`Upper bound after 5,299 zero-failure checks: ${(zeroFailureUpperBound(5_299) * 1_000_000).toFixed(1)} failures per million`);
console.log(`Upper bound after 1,000,000 zero-failure checks: ${(zeroFailureUpperBound(1_000_000) * 1_000_000).toFixed(3)} failures per million`);
console.log("Reliability budget calculations: PASS");
