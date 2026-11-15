// Every job status write must be a legal edge in lib/jobTransitions.ts, read
// from the route's own guard (the `where` status) and target (the `data` status).
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { JOB_TRANSITIONS, canTransition, assertTransition } from "../../lib/jobTransitions.ts";

let checks = 0;
const ok = (c, m) => { assert.ok(c, m); checks++; };
const eq = (a, e, m) => { assert.deepEqual(a, e, m); checks++; };

// Legal and illegal edges.
for (const [from, to] of [["open", "accepted"], ["accepted", "in_transit"], ["in_transit", "delivered"], ["delivered", "completed"], ["delivered", "in_transit"], ["accepted", "open"], ["open", "cancelled"], ["accepted", "cancelled"], ["in_transit", "cancelled"]]) {
  ok(canTransition(from, to), `${from} -> ${to} is legal`);
}
for (const [from, to] of [["completed", "open"], ["cancelled", "accepted"], ["open", "completed"], ["in_transit", "accepted"], ["delivered", "cancelled"], ["completed", "cancelled"], ["open", "in_transit"]]) {
  ok(!canTransition(from, to), `${from} -> ${to} is illegal`);
}
assert.throws(() => assertTransition("delivered", "cancelled"), /Illegal job transition/);
checks++;
for (const s of ["completed", "cancelled"]) eq(JOB_TRANSITIONS[s], [], `${s} is terminal`);

const read = (f) => readFileSync(f, "utf8");
const statusIn = (block) => (block.match(/\bstatus:\s*"(\w+)"/) || [])[1];

// Routes whose guard is a literal status in the update's `where`.
const literal = [
  ["app/api/jobs/[id]/accept/route.ts", "open", "accepted"],
  ["app/api/jobs/[id]/bids/[bidId]/accept/route.ts", "open", "accepted"],
  ["app/api/jobs/[id]/confirm-pickup/route.ts", "accepted", "in_transit"],
  ["app/api/jobs/[id]/mark-delivered/route.ts", "in_transit", "delivered"],
  ["app/api/jobs/[id]/confirm-delivered/route.ts", "delivered", "completed"],
  ["app/api/jobs/[id]/reject-delivered/route.ts", "delivered", "in_transit"],
  ["app/api/jobs/[id]/unassign/route.ts", "accepted", "open"],
  ["app/api/jobs/[id]/driver-cancel/route.ts", "accepted", "open"],
];
for (const [file, from, to] of literal) {
  const src = read(file);
  const m = src.match(/job\.updateMany\(\{\s*where:\s*\{((?:[^{}]|\{[^{}]*\})*)\},\s*data:\s*\{([^}]*)/);
  ok(m, `${file} updates the job with a where and data block`);
  eq([statusIn(m[1]), statusIn(m[2])], [from, to], `${file} moves ${from} -> ${to}`);
  ok(canTransition(from, to), `${file}: ${from} -> ${to} is in the table`);
  ok(new RegExp(`toStatus:\\s*"${to}"`).test(src), `${file} logs the move to ${to}`);
  ok(src.includes("$transaction"), `${file} updates inside a transaction`);
}

// Routes whose guard is the status read earlier; each restricts it and checks the table.
const variable = [
  ["app/api/jobs/[id]/cancel/route.ts", ["open", "accepted"], "cancelled"],
  ["app/api/jobs/[id]/incidents/terminate/route.ts", ["accepted", "in_transit"], "cancelled"],
  ["app/api/admin/incidents/resolve/route.ts", ["accepted", "in_transit"], "cancelled"],
  ["app/api/internal/admin-bridge/route.ts", ["accepted", "in_transit"], "cancelled"],
];
for (const [file, froms, to] of variable) {
  const src = read(file);
  for (const from of froms) ok(canTransition(from, to), `${file}: ${from} -> ${to} is in the table`);
  ok(src.includes(`canTransition(job.status, "${to}")`), `${file} checks the transition table before updating`);
  ok(src.includes(`@/lib/jobTransitions`), `${file} imports the table`);
  ok(new RegExp(`status:\\s*"${to}"`).test(src) && /toStatus:\s*"cancelled"/.test(src), `${file} writes and logs ${to}`);
}
ok(/job\.status !== "open" && job\.status !== "accepted"/.test(read("app/api/jobs/[id]/cancel/route.ts")), "cancel refuses anything but open or accepted");
for (const file of ["app/api/jobs/[id]/incidents/terminate/route.ts", "app/api/admin/incidents/resolve/route.ts", "app/api/internal/admin-bridge/route.ts"]) {
  ok(/job\.status !== "accepted" && job\.status !== "in_transit"/.test(read(file)), `${file} refuses anything but accepted or in_transit`);
}

// Payment confirmation routes act on completed jobs and must not change status.
for (const file of ["app/api/jobs/[id]/payment/mark-paid/route.ts", "app/api/jobs/[id]/payment/confirm-received/route.ts"]) {
  const m = read(file).match(/job\.updateMany\(\{\s*where:\s*\{((?:[^{}]|\{[^{}]*\})*)\},\s*data:\s*\{([^}]*)/);
  ok(m, `${file} updates the job`);
  eq([statusIn(m[1]), statusIn(m[2])], ["completed", undefined], `${file} only acts on completed jobs and writes no status`);
}

// Editing is limited to open jobs.
ok(/where: \{\s*id: routeParams\.id,\s*posterId: accountId,\s*status: "open",/.test(read("app/api/jobs/[id]/edit/route.ts")), "edit only changes open jobs");

// No other route may write Job.status.
import { readdirSync, statSync } from "node:fs";
import { join } from "node:path";
const known = new Set([...literal.map((l) => l[0]), ...variable.map((v) => v[0])]);
const offenders = [];
(function walk(dir) {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) { walk(path); continue; }
    if (!/\.(ts|tsx)$/.test(name) || known.has(path)) continue;
    const src = read(path);
    if (/job\.(update|updateMany)\(\{[\s\S]*?data:\s*\{[^}]*\bstatus:\s*"(open|accepted|in_transit|delivered|completed|cancelled)"/.test(src)) offenders.push(path);
  }
})("app/api");
eq(offenders, [], "no other API route writes Job.status; add new write sites to this contract");

console.log(`job transitions contract passed (${checks} checks)`);
