// Every job status write must be a legal edge in lib/jobTransitions.ts.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { JOB_TRANSITIONS, canTransition, assertTransition } from "../../lib/jobTransitions.ts";

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks++; };

// Legal edges.
ok(canTransition("open", "accepted"), "accept moves open to accepted");
ok(canTransition("accepted", "in_transit"), "pickup moves accepted to in_transit");
ok(canTransition("in_transit", "delivered"), "delivery mark moves in_transit to delivered");
ok(canTransition("delivered", "completed"), "confirmation completes a delivered job");
ok(canTransition("delivered", "in_transit"), "rejecting delivery returns to in_transit");
ok(canTransition("accepted", "open"), "unassigning returns the job to open");
// Illegal edges.
ok(!canTransition("completed", "open"), "completed jobs never reopen");
ok(!canTransition("cancelled", "accepted"), "cancelled jobs never revive");
ok(!canTransition("open", "completed"), "a job cannot skip pickup and delivery");
ok(!canTransition("in_transit", "accepted"), "pickup cannot be undone into accepted");
assert.throws(() => assertTransition("completed", "in_transit"), /Illegal job transition/);
checks++;

// Terminal states have no exits.
for (const s of ["completed", "cancelled"]) ok(JOB_TRANSITIONS[s].length === 0, `${s} is terminal`);

// Write sites: file, target status, from-states the route's where-clause requires.
const sites = [
  ["app/api/jobs/[id]/accept/route.ts", "accepted", ["open"]],
  ["app/api/jobs/[id]/bids/[bidId]/accept/route.ts", "accepted", ["open"]],
  ["app/api/jobs/[id]/confirm-pickup/route.ts", "in_transit", ["accepted"]],
  ["app/api/jobs/[id]/mark-delivered/route.ts", "delivered", ["in_transit"]],
  ["app/api/jobs/[id]/confirm-delivered/route.ts", "completed", ["delivered"]],
  ["app/api/jobs/[id]/payment/mark-paid/route.ts", "completed", ["delivered"]],
  ["app/api/jobs/[id]/payment/confirm-received/route.ts", "completed", ["delivered"]],
  ["app/api/jobs/[id]/reject-delivered/route.ts", "in_transit", ["delivered"]],
  ["app/api/jobs/[id]/unassign/route.ts", "open", ["accepted"]],
  ["app/api/jobs/[id]/driver-cancel/route.ts", "open", ["accepted"]],
  ["app/api/jobs/[id]/cancel/route.ts", "cancelled", ["open", "accepted"]],
  ["app/api/jobs/[id]/incidents/terminate/route.ts", "cancelled", ["accepted", "in_transit", "delivered"]],
  ["app/api/admin/incidents/resolve/route.ts", "cancelled", ["accepted", "in_transit", "delivered"]],
];
for (const [file, to, froms] of sites) {
  const src = readFileSync(file, "utf8");
  ok(new RegExp(`status:\\s*"${to}"`).test(src), `${file} writes ${to}`);
  for (const from of froms) ok(canTransition(from, to), `${file}: ${from} -> ${to} must be a legal edge`);
}

// Routes that rewrite status outside a conditional where-clause are not allowed.
const edit = readFileSync("app/api/jobs/[id]/edit/route.ts", "utf8");
ok(/where: \{\s*id: routeParams\.id,\s*posterId: accountId,\s*status: "open",/.test(edit), "edit only changes open jobs");

console.log(`job transitions contract passed (${checks} checks)`);
