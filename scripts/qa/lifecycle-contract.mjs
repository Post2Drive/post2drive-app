#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync, existsSync } from "node:fs";

const read = (path) => {
  assert.ok(existsSync(path), `Required launch-readiness file missing: ${path}`);
  return readFileSync(path, "utf8");
};
const contains = (path, snippets) => {
  const source = read(path);
  for (const snippet of snippets) {
    assert.ok(source.includes(snippet), `${path} is missing required lifecycle contract: ${snippet}`);
  }
};

contains("app/api/jobs/[id]/cancel/route.ts", [
  'job.status !== "open" && job.status !== "accepted"',
  'code: "INCIDENT_REQUIRED"',
  'action: "JOB_CANCELLED"',
  'tx.bid.updateMany',
  "tx.notification.create",
]);

contains("lib/cancellationLimits.ts", [
  "JOB_TERMINATED_WITH_INCIDENT",
  "incidentTerminatedJobIds",
  "ordinary cancellation/unassignment allowance",
]);

contains("app/api/jobs/[id]/incidents/route.ts", [
  'action: "INCIDENT_REPORTED"',
  "getInvolvedJob",
  "MAX_DESCRIPTION_LENGTH",
  "MAX_EVIDENCE_ITEMS",
  "tx.notification.create",
  "lifecycleStatusAtReport",
]);

contains("app/api/jobs/[id]/incidents/updates/route.ts", [
  'action: "INCIDENT_UPDATE_ADDED"',
  "parentIncidentId",
  "tx.notification.create",
]);

contains("app/api/jobs/[id]/incidents/terminate/route.ts", [
  'status: "cancelled"',
  'action: "JOB_TERMINATED_WITH_INCIDENT"',
  "cancellationLimitBypassedForSafetyIncident",
  "pickupHistoryPreserved",
  "deliveryHistoryPreserved",
  "reportedReason !== reason",
  "tx.notification.create",
]);

contains("app/api/jobs/[id]/incidents/[incidentId]/evidence/route.ts", [
  "MAX_FILE_BYTES",
  "validSignature",
  "createHash",
  "tx.incidentEvidence.create",
  "MAX_FILES_PER_INCIDENT",
]);
contains("app/api/jobs/[id]/incidents/[incidentId]/evidence/[evidenceId]/route.ts", [
  "isTesterAdmin()",
  "const admin = await isTesterAdmin()",
  "if (!isParty && !admin)",
  "X-Content-Type-Options",
  "Cache-Control",
  "Content-Disposition",
]);

contains("app/api/admin/incidents/resolve/route.ts", [
  "isTesterAdmin()",
  'action: "INCIDENT_RESOLUTION_RECORDED"',
  "ALLOWED_OUTCOMES",
  "ALLOWED_TERMINATION_REASONS",
  'outcome === "terminate_with_incident"',
  'job.status !== "accepted" && job.status !== "in_transit"',
  'status: "cancelled"',
  "transition.count !== 1",
  "tx.bid.updateMany",
  "lifecycleChanged",
  "tx.notification.create",
]);

contains("app/api/notifications/route.ts", [
  "where: { accountId }",
  "unreadCount",
]);
contains("app/api/notifications/[id]/read/route.ts", [
  "where: { id, accountId, readAt: null }",
]);

contains("app/api/jobs/[id]/accept/route.ts", [
  'priceMode: "fixed"',
  'action: "JOB_ACCEPTED"',
  "tx.notification.create",
]);
contains("app/api/jobs/[id]/bid/route.ts", [
  "FOR UPDATE",
  'action: "BID_PLACED"',
  "tx.notification.create",
]);
contains("app/api/jobs/[id]/bids/[bidId]/accept/route.ts", [
  'action: "BID_ACCEPTED"',
  "tx.notification.create",
  "tx.bid.updateMany",
]);
contains("app/api/jobs/[id]/driver-cancel/route.ts", [
  'status: "accepted"',
  'action: "DRIVER_BACKED_OUT"',
  "tx.notification.create",
]);
contains("app/api/jobs/[id]/unassign/route.ts", [
  'status: "accepted"',
  'action: "DRIVER_UNASSIGNED"',
  "tx.notification.create",
]);
contains("app/api/jobs/[id]/confirm-pickup/route.ts", [
  'status: "accepted"',
  'toStatus: "in_transit"',
  "tx.notification.create",
]);
contains("app/api/jobs/[id]/mark-delivered/route.ts", [
  'job.status !== "in_transit"',
  'toStatus: "delivered"',
  "tx.notification.create",
]);
contains("app/api/jobs/[id]/confirm-delivered/route.ts", [
  'status: "delivered"',
  'toStatus: "completed"',
  "tx.notification.create",
]);
contains("app/api/jobs/[id]/reject-delivered/route.ts", [
  'status: "delivered"',
  'status: "in_transit"',
  'action: "DELIVERY_REJECTED"',
  "tx.notification.create",
]);


contains("app/jobs/[id]/incidents/page.tsx", [
  "getServerSession",
  "job.posterId !== accountId && job.acceptedById !== accountId",
  "<IncidentPanel",
]);
contains("app/jobs/[id]/incidents/incident-panel.tsx", [
  "/api/jobs/",
  "Submit incident report",
  "Incident history",
  "Terminate job with this incident",
]);
contains("app/jobs/page.tsx", [
  "/jobs/${job.id}/incidents",
]);
contains("components/notification-center.tsx", [
  "/api/notifications?limit=10",
  "Mark as read",
]);
contains("app/admin/incidents/page.tsx", [
  "isTesterAdmin()",
  "<IncidentReview",
]);
contains("app/admin/page.tsx", [
  'href="/admin/incidents"',
]);
contains("prisma/schema.prisma", [
  "model Notification",
  "model IncidentEvidence",
  "content   Bytes",
  "notifications        Notification[]",
  "eventKey  String?  @unique",
]);
contains("prisma/migrations/20261013160000_add_notifications/migration.sql", [
  'CREATE TABLE "Notification"',
  '"Notification_accountId_fkey"',
]);
contains("prisma/migrations/20261013170000_add_incident_evidence/migration.sql", [
  'CREATE TABLE "IncidentEvidence"',
  '"content" BYTEA NOT NULL',
  '"IncidentEvidence_incidentId_fkey"',
  '"IncidentEvidence_uploadedById_fkey"',
]);


contains("app/api/jobs/route.ts", [
  "isSupportedMarket(account)",
  "validateJobInput(body, account)",
  "crossBorder: false",
  "poster: { country, currency }",
]);

// Every job-specific API must enforce the stored account market boundary.
for (const path of [
  "app/api/jobs/[id]/route.ts",
  "app/api/jobs/[id]/activity/route.ts",
  "app/api/jobs/[id]/accept/route.ts",
  "app/api/jobs/[id]/bid/route.ts",
  "app/api/jobs/[id]/bids/route.ts",
  "app/api/jobs/[id]/bids/[bidId]/accept/route.ts",
  "app/api/jobs/[id]/edit/route.ts",
  "app/api/jobs/[id]/cancel/route.ts",
  "app/api/jobs/[id]/driver-cancel/route.ts",
  "app/api/jobs/[id]/unassign/route.ts",
  "app/api/jobs/[id]/confirm-pickup/route.ts",
  "app/api/jobs/[id]/mark-delivered/route.ts",
  "app/api/jobs/[id]/confirm-delivered/route.ts",
  "app/api/jobs/[id]/reject-delivered/route.ts",
  "app/api/jobs/[id]/payment/mark-paid/route.ts",
  "app/api/jobs/[id]/payment/confirm-received/route.ts",
  "app/api/jobs/[id]/incidents/route.ts",
  "app/api/jobs/[id]/incidents/terminate/route.ts",
  "app/api/jobs/[id]/incidents/updates/route.ts",
  "app/api/jobs/[id]/incidents/[incidentId]/evidence/route.ts",
  "app/api/jobs/[id]/incidents/[incidentId]/evidence/[evidenceId]/route.ts",
]) {
  contains(path, ["requireJobMarketAccess"]);
}
contains("lib/jobMarket.ts", [
  "isSupportedMarket(actor)",
  "sameMarket(actor, job.poster)",
  'actor.currency !== job.currency',
  'job.crossBorder',
]);
contains("lib/jobAccess.ts", [
  "getJobPickupAtForAccount",
  "localDateTimeToInstant",
  "marketTimeZone",
  "isSupportedMarket(account)",
]);
contains("lib/market.ts", ["Asia/Kolkata", "Europe/London", "sameMarket"]);
contains("lib/localTime.ts", ["INVALID_PICKUP_TIME_DST", "AMBIGUOUS_PICKUP_TIME_DST", "Intl.DateTimeFormat"]);
for (const path of [
  "app/api/jobs/[id]/accept/route.ts",
  "app/api/jobs/[id]/bid/route.ts",
  "app/api/jobs/[id]/bids/[bidId]/accept/route.ts",
  "app/api/jobs/[id]/edit/route.ts",
]) {
  contains(path, ["getJobPickupAtForAccount"]);
}

console.log("Lifecycle contract checks passed. These are static regression guards, not substitutes for API integration, browser, concurrency, or staging live tests.");
