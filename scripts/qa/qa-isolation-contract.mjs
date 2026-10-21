import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const route = readFileSync(new URL("../../app/api/jobs/route.ts", import.meta.url), "utf8");
const helper = readFileSync(new URL("../../lib/qaIsolation.ts", import.meta.url), "utf8");
const schema = readFileSync(new URL("../../prisma/schema.prisma", import.meta.url), "utf8");
const pkg = JSON.parse(readFileSync(new URL("../../package.json", import.meta.url), "utf8"));

assert.match(helper, /SELECT EXISTS/);
assert.match(helper, /WHERE account_id = \$\{accountId\}/);
assert.doesNotMatch(helper, /SELECT DISTINCT account_id/);
assert.match(route, /requesterIsQaAccount = await isQaAccount\(accountId\)/);
assert.match(route, /qaTestAccounts: \{ none: \{\} \}/);
assert.doesNotMatch(route, /notIn: syntheticAccountIds/);
assert.match(schema, /qaTestAccounts QaTestAccount\[\]/);
assert.match(schema, /@@map\("qa_test_accounts"\)/);
assert.equal(pkg.scripts["qa:qa-isolation-contract"], "node scripts/qa/qa-isolation-contract.mjs");
assert.match(pkg.scripts["qa:all"], /qa:qa-isolation-contract/);

console.log("QA isolation parameter-limit contract checks passed.");
