#!/usr/bin/env node
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import vm from "node:vm";
import ts from "typescript";
import { createRequire } from "node:module";

const routes = [
  ["app/api/jobs/[id]/route.ts", "GET"],
  ["app/api/jobs/[id]/activity/route.ts", "GET"],
  ["app/api/jobs/[id]/accept/route.ts", "POST"],
  ["app/api/jobs/[id]/bid/route.ts", "POST"],
  ["app/api/jobs/[id]/bids/route.ts", "GET"],
  ["app/api/jobs/[id]/bids/[bidId]/accept/route.ts", "POST"],
  ["app/api/jobs/[id]/cancel/route.ts", "POST"],
  ["app/api/jobs/[id]/driver-cancel/route.ts", "POST"],
  ["app/api/jobs/[id]/confirm-pickup/route.ts", "POST"],
  ["app/api/jobs/[id]/mark-delivered/route.ts", "POST"],
  ["app/api/jobs/[id]/confirm-delivered/route.ts", "POST"],
  ["app/api/jobs/[id]/reject-delivered/route.ts", "POST"],
  ["app/api/jobs/[id]/unassign/route.ts", "POST"],
  ["app/api/jobs/[id]/edit/route.ts", "PATCH"],
  ["app/api/jobs/[id]/payment/mark-paid/route.ts", "POST"],
  ["app/api/jobs/[id]/payment/confirm-received/route.ts", "POST"],
  ["app/api/jobs/[id]/incidents/route.ts", "GET"],
  ["app/api/jobs/[id]/incidents/route.ts", "POST"],
  ["app/api/jobs/[id]/incidents/terminate/route.ts", "POST"],
  ["app/api/jobs/[id]/incidents/updates/route.ts", "POST"],
  ["app/api/jobs/[id]/incidents/[incidentId]/evidence/route.ts", "POST"],
  ["app/api/jobs/[id]/incidents/[incidentId]/evidence/[evidenceId]/route.ts", "GET"],
  ["app/api/jobs/route.ts", "GET"],
  ["app/api/jobs/route.ts", "POST"],
  ["app/api/vehicles/route.ts", "GET"],
  ["app/api/vehicles/route.ts", "POST"],
];

const job = {
  id: "fixture-job", posterId: "fixture-poster", acceptedById: "fixture-driver",
  status: "accepted", priceMode: "fixed", country: "GB", vehicleType: "van",
  pickupAt: new Date(Date.now() + 86400000), dropoffAt: new Date(Date.now() + 172800000),
  deliveryMarkedById: "fixture-driver", paidMarkedAt: new Date("2026-01-01T00:00:00Z"),
  receivedConfirmedAt: null, cancelledById: null, pickupConfirmedAt: null,
  title: "isolated security fixture", description: "fixture only", price: 100,
  bids: [], activities: [], incidents: [],
};
const account = {
  id: "fixture-outsider", country: "GB", type: "both", verificationStatus: "verified",
  deletionRequestedAt: null, vehicles: [], users: [], testerApprovalStatus: "approved",
};
let session = null;
let mutationCalls = [];
const result = (body = {}, init = {}) => ({ status: init.status ?? 200, body, headers: new Headers(init.headers ?? {}) });
const prisma = new Proxy({}, {
  get(_target, model) {
    if (model === "$transaction") return async (callback) => callback(prisma);
    if (model === "$executeRaw" || model === "$executeRawUnsafe") return async () => 0;
    if (model === "$queryRaw" || model === "$queryRawUnsafe") return async () => [];
    return new Proxy({}, {
      get(_target2, method) {
        return async (args = {}) => {
          if (["create", "createMany", "update", "updateMany", "upsert", "delete", "deleteMany"].includes(String(method))) {
            mutationCalls.push({ model: String(model), method: String(method), args });
          }
          if (model === "job" && ["findUnique", "findFirst", "findUniqueOrThrow"].includes(String(method))) return job;
          if (model === "job" && method === "findMany") return [job];
          if (model === "account" && ["findUnique", "findFirst"].includes(String(method))) return account;
          if (model === "vehicle" && ["findFirst", "findUnique"].includes(String(method))) return null;
          if (model === "vehicle" && method === "findMany") return [];
          if (model === "incidentEvidence" && ["findFirst", "findUnique"].includes(String(method))) {
            return { id: "fixture-evidence", incidentId: "fixture-incident", jobId: job.id, uploadedById: job.posterId, job };
          }
          if (model === "incident" && ["findUnique", "findFirst"].includes(String(method))) {
            return { id: "fixture-incident", jobId: job.id, job, reportedById: job.posterId, status: "open" };
          }
          if (method === "updateMany") return { count: 0 };
          if (method === "findMany") return [];
          if (method === "count") return 0;
          if (method === "aggregate") return {};
          if (method === "groupBy") return [];
          if (method === "create") return { id: "fixture-created", createdAt: new Date() };
          return null;
        };
      },
    });
  },
});
const genericModule = new Proxy({}, {
  get(_target, name) {
    if (name === "__esModule") return true;
    return (..._args) => null;
  },
});
const requireExternal = createRequire(import.meta.url);
function loadRoute(path) {
  const source = readFileSync(path, "utf8");
  const compiled = ts.transpileModule(source, {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    fileName: path,
  }).outputText;
  const module = { exports: {} };
  const mockRequire = (name) => {
    if (name === "next/server") return { NextResponse: { json: result } };
    if (name === "next-auth") return { getServerSession: async () => session };
    if (name === "@/lib/auth") return { authOptions: {} };
    if (name === "@/lib/prisma") return { prisma };
    if (name === "@/lib/apiMetrics") return { withApiMetrics: (_name, handler) => handler };
    if (name.startsWith("@/lib/")) return genericModule;
    try { return requireExternal(name); } catch { return genericModule; }
  };
  vm.runInNewContext(compiled, {
    module, exports: module.exports, require: mockRequire, console,
    Headers, Request, Response, URL, Date, Promise, Buffer, setTimeout, clearTimeout,
  }, { filename: path });
  return module.exports;
}

const params = { id: job.id, bidId: "fixture-bid", incidentId: "fixture-incident", evidenceId: "fixture-evidence" };
const makeRequest = (method) => new Request("https://fixture.invalid/api/test", {
  method,
  headers: { "content-type": "application/json" },
  body: ["GET", "HEAD"].includes(method) ? undefined : JSON.stringify({
    reason: "isolated authorization fixture", description: "isolated authorization fixture",
    amount: 100, outcome: "no_further_action", message: "fixture",
  }),
});

for (const [path, method] of routes) {
  const route = loadRoute(path);
  assert.equal(typeof route[method], "function", path + " must export " + method);
  const handler = route[method];
  const invoke = () => handler(makeRequest(method), { params: Promise.resolve(params) });

  session = null;
  mutationCalls = [];
  let response = await invoke();
  assert.equal(response?.status, 401, method + " " + path + ": unauthenticated request must return 401 (got " + response?.status + ")");
  assert.equal(mutationCalls.length, 0, method + " " + path + ": unauthenticated request attempted a mutation");

  session = { user: { accountId: account.id, email: "outsider@example.invalid" } };
  mutationCalls = [];
  response = await invoke();
  assert.ok([400, 401, 403, 404, 409, 422].includes(response?.status),
    method + " " + path + ": unrelated account must be denied without a 5xx (got " + response?.status + ")");
  assert.equal(mutationCalls.length, 0,
    method + " " + path + ": unrelated account reached a mutating Prisma call: " + JSON.stringify(mutationCalls));
}
console.log("PASS isolated lifecycle authorization matrix: " + routes.length + " method/route cases rejected unauthenticated and cross-account requests without writes.");
