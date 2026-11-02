/**
 * Static contract: POST /api/ratings must enforce rate limiting, job completion
 * gate, party checks, auth, bounded body, and duplicate prevention.
 */
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const src = readFileSync(new URL("../../app/api/ratings/route.ts", import.meta.url), "utf8");

// Auth
assert.match(src, /getServerSession\(authOptions\)/, "Must require authenticated session");
assert.match(src, /if \(!accountId\)/, "Must check for accountId");
assert.match(src, /Authentication required/, "Must return Authentication required error");

// Bounded body
assert.match(src, /readBoundedJson/, "Must use readBoundedJson to limit request body size");

// Rate limiting
assert.match(src, /enforceRateLimit/, "Must call enforceRateLimit");
assert.match(src, /rating-submit/, "Rate limit scope must be 'rating-submit'");
assert.match(src, /limit: 20/, "Rate limit must be capped at 20 per window");
assert.match(src, /60 \* 60 \* 1000/, "Rate limit window must be 1 hour");

// Job completion gate
assert.match(src, /rateableStatuses/, "Must define rateable statuses");
assert.match(src, /"completed"/, "Must include 'completed' as a rateable status");
assert.match(src, /"delivered"/, "Must include 'delivered' as a rateable status");
assert.match(src, /status: 409/, "Must return 409 for non-rateable job status");

// Stars validation (1–5 integer)
assert.match(src, /Number\.isInteger\(numericStars\)/, "Stars must be validated as integer");
assert.match(src, /numericStars < 1/, "Stars must be at least 1");
assert.match(src, /numericStars > 5/, "Stars must be at most 5");

// Comment length cap
assert.match(src, /comment\.length > 1000/, "Comment must be capped at 1000 characters");

// Party check (rateeId + 403)
assert.match(src, /rateeId/, "Must determine the ratee from job parties");
assert.match(src, /status: 403/, "Must return 403 when rater was not matched on the job");

// Duplicate prevention
assert.match(src, /skipDuplicates: true/, "Must use skipDuplicates to prevent duplicate ratings");
assert.match(src, /result\.count !== 1/, "Must check insert count to detect duplicates");
assert.match(src, /already rated/, "Must return error message when rating already submitted");

console.log("ratings-contract passed.");
