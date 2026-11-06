import { readFileSync } from "node:fs";

const routes = [
  ["app/api/subscription/create-payment/route.ts", "subscription-create-payment"],
  ["app/api/verification/start/route.ts", "verification-start"],
  ["app/api/verification/start/webhook/route.ts", "verification-webhook"],
  ["app/api/jobs/[id]/accept/route.ts", "job-accept"],
  ["app/api/jobs/[id]/bids/[bidId]/accept/route.ts", "job-bid-accept"],
  ["app/api/jobs/[id]/cancel/route.ts", "job-cancel"],
  ["app/api/jobs/[id]/confirm-delivered/route.ts", "job-confirm-delivered"],
  ["app/api/jobs/[id]/confirm-pickup/route.ts", "job-confirm-pickup"],
  ["app/api/jobs/[id]/driver-cancel/route.ts", "job-driver-cancel"],
  ["app/api/jobs/[id]/edit/route.ts", "job-edit"],
  ["app/api/jobs/[id]/incidents/route.ts", "job-incident-create"],
  ["app/api/jobs/[id]/incidents/terminate/route.ts", "job-incident-terminate"],
  ["app/api/jobs/[id]/incidents/updates/route.ts", "job-incident-update"],
  ["app/api/jobs/[id]/mark-delivered/route.ts", "job-mark-delivered"],
  ["app/api/jobs/[id]/reject-delivered/route.ts", "job-reject-delivered"],
  ["app/api/jobs/[id]/unassign/route.ts", "job-unassign"],
];

const failures = [];
for (const [file, scope] of routes) {
  const source = readFileSync(file, "utf8");
  if (!source.includes('from "@/lib/rateLimit"')) failures.push(`${file}: missing rateLimit import`);
  if (!source.includes("enforceRateLimit(")) failures.push(`${file}: missing enforceRateLimit call`);
  if (!source.includes(`scope: "${scope}"`)) failures.push(`${file}: missing scope "${scope}"`);
}

if (failures.length) {
  console.error(failures.join("\n"));
  process.exit(1);
}
console.log(`Route rate-limit contract passed (${routes.length} routes).`);
