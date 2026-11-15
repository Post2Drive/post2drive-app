// Behavioural contract for proof photos: image processing (real sharp), the
// driver upload route, the list/fetch routes and the retention purge. Runs the
// real code against an in-memory fake of Prisma, so it needs no database.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { createRequire } from "node:module";
import vm from "node:vm";
import ts from "typescript";

const nodeRequire = createRequire(import.meta.url);
const sharp = nodeRequire("sharp");

let checks = 0;
const ok = (value, message) => { assert.ok(value, message); checks++; };
const eq = (actual, expected, message) => { assert.deepEqual(actual, expected, message); checks++; };

function load(path, mocks) {
  const compiled = ts.transpileModule(readFileSync(path, "utf8"), {
    compilerOptions: { module: ts.ModuleKind.CommonJS, target: ts.ScriptTarget.ES2022, esModuleInterop: true },
    fileName: path,
  }).outputText;
  const module = { exports: {} };
  const mockRequire = (name) => {
    if (!(name in mocks)) throw new Error(`Unexpected dependency in isolated test: ${name}`);
    return mocks[name];
  };
  vm.runInNewContext(compiled, {
    module, exports: module.exports, require: mockRequire, console, Headers, Request, Response, URL, Date, Promise,
    FormData, File, Blob, Buffer, Uint8Array, ArrayBuffer, Number, Math, Error,
  }, { filename: path });
  return module.exports;
}

const lib = load("lib/proofPhotos.ts", { "node:crypto": nodeRequire("node:crypto"), sharp });
const rules = load("lib/marketRules.ts", { "./market.ts": { MARKETS: {} } });

// ── library: stages, expiry, rules ─────────────────────────────────────────
eq([lib.isProofStage("pickup"), lib.isProofStage("delivery"), lib.isProofStage("other"), lib.isProofStage(undefined)], [true, true, false, false], "only pickup and delivery are stages");
eq([lib.PROOF_STAGE_JOB_STATUS.pickup, lib.PROOF_STAGE_JOB_STATUS.delivery], ["accepted", "in_transit"], "stage to job status");
const t0 = new Date("2026-01-01T00:00:00Z");
eq(lib.proofExpiry(t0).toISOString(), "2026-01-31T00:00:00.000Z", "photos expire after 30 days");
eq(rules.rulesForCountry("GB").proofPhotosRequired, true, "UK requires photos");
eq(rules.rulesForCountry("IN").proofPhotosRequired, false, "India does not");

// ── library: image processing ──────────────────────────────────────────────
const exifImage = await sharp({ create: { width: 600, height: 400, channels: 3, background: "#336699" } })
  .jpeg().withExif({ IFD0: { Copyright: "SECRET-OWNER", Artist: "SECRET-ARTIST" } }).toBuffer();
ok(exifImage.includes(Buffer.from("SECRET-OWNER")), "the test image really carries metadata");
let result = await lib.processProofPhoto(new Uint8Array(exifImage));
ok(result.ok, "a JPEG with metadata is accepted");
eq(result.mimeType, "image/jpeg", "output is JPEG");
ok(!result.content.includes(Buffer.from("SECRET-OWNER")) && !result.content.includes(Buffer.from("SECRET-ARTIST")), "metadata is stripped");
const outMeta = await sharp(result.content).metadata();
eq([outMeta.format, outMeta.exif === undefined, outMeta.icc === undefined], ["jpeg", true, true], "output has no EXIF or profile");
eq([result.width, result.height, result.sizeBytes], [600, 400, result.content.byteLength], "reported size matches the output");
eq(result.sha256.length, 64, "a sha256 is recorded");

const big = await sharp({ create: { width: 4000, height: 3000, channels: 3, background: "#aa5500" } }).png().toBuffer();
result = await lib.processProofPhoto(new Uint8Array(big));
ok(result.ok && Math.max(result.width, result.height) === 2048, "large photos are scaled so the longest edge is 2048");
eq(result.width / result.height > 1.3 && result.width / result.height < 1.4, true, "aspect ratio is kept");

const rotated = await sharp({ create: { width: 300, height: 200, channels: 3, background: "#00aa00" } }).jpeg().withMetadata({ orientation: 6 }).toBuffer();
result = await lib.processProofPhoto(new Uint8Array(rotated));
ok(result.ok && result.width === 200 && result.height === 300, "orientation is applied before metadata is dropped");

const alpha = await sharp({ create: { width: 50, height: 50, channels: 4, background: { r: 0, g: 0, b: 0, alpha: 0 } } }).png().toBuffer();
ok((await lib.processProofPhoto(new Uint8Array(alpha))).ok, "a transparent PNG is accepted");
const webp = await sharp({ create: { width: 50, height: 50, channels: 3, background: "#fff" } }).webp().toBuffer();
ok((await lib.processProofPhoto(new Uint8Array(webp))).ok, "WebP is accepted");

for (const [label, bytes] of [
  ["plain text", Buffer.from("hello world")],
  ["an SVG", Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"><script>alert(1)</script></svg>')],
  ["a PDF", Buffer.from("%PDF-1.4\n1 0 obj\n<<>>\nendobj\n")],
  ["an empty file", Buffer.alloc(0)],
  ["a truncated JPEG", exifImage.subarray(0, 40)],
]) {
  const bad = await lib.processProofPhoto(new Uint8Array(bytes));
  eq(bad.ok, false, `${label} is refused`);
}
const gif = await sharp({ create: { width: 10, height: 10, channels: 3, background: "#fff" } }).gif().toBuffer();
eq((await lib.processProofPhoto(new Uint8Array(gif))).ok, false, "GIF is not an accepted format");

// ── in-memory state ────────────────────────────────────────────────────────
let job, photos, session, admin, marketBlock, rateLimited, idCounter, purgeCalls;
function reset(overrides = {}) {
  job = { id: "job1", status: "accepted", posterId: "poster", acceptedById: "driver", ...overrides };
  photos = []; session = { user: { accountId: "driver" } }; admin = false; marketBlock = null; rateLimited = null; idCounter = 0;
}
const gt = (v, c) => v.getTime() > c.gt.getTime();
const inJobStatus = (photo) => job.status;
function photoMatches(p, where) {
  if (where.id && p.id !== where.id) return false;
  if (where.jobId && p.jobId !== where.jobId) return false;
  if (where.stage && p.stage !== where.stage) return false;
  if (where.expiresAt?.gt && !gt(p.expiresAt, where.expiresAt)) return false;
  if (where.expiresAt?.lt && !(p.expiresAt.getTime() < where.expiresAt.lt.getTime())) return false;
  if (where.job?.status?.not !== undefined && inJobStatus(p) === where.job.status.not) return false;
  if (where.id?.in) return where.id.in.includes(p.id);
  if (where.OR && !where.OR.some((c) => (c.expiresAt ? gt(p.expiresAt, c.expiresAt) : c.job.status === inJobStatus(p)))) return false;
  return true;
}
const prisma = {
  job: {
    findUnique: async ({ where }) => (where.id === job.id ? { ...job } : null),
  },
  jobProofPhoto: {
    count: async ({ where }) => photos.filter((p) => photoMatches(p, where)).length,
    create: async ({ data, select }) => {
      const row = { id: `p${++idCounter}`, createdAt: new Date(), ...data };
      photos.push(row);
      return Object.fromEntries(Object.keys(select).map((k) => [k, row[k]]));
    },
    findMany: async ({ where, select, take }) => photos.filter((p) => photoMatches(p, where)).slice(0, take ?? 1000)
      .map((p) => Object.fromEntries(Object.keys(select).map((k) => [k, p[k]]))),
    findFirst: async ({ where }) => {
      const p = photos.find((row) => photoMatches(row, where));
      return p ? { ...p, job: { posterId: job.posterId, acceptedById: job.acceptedById } } : null;
    },
    deleteMany: async ({ where }) => { const before = photos.length; photos = photos.filter((p) => !where.id.in.includes(p.id)); return { count: before - photos.length }; },
  },
  $queryRaw: async () => [{ id: job.id }],
  $transaction: async (fn) => fn(prisma),
};
// A purge-capable fake whose "job" relation reflects the current job status.
const requestBody = load("lib/requestBody.ts", {});
const common = {
  "@/lib/apiMetrics": { withApiMetrics: (_n, handler) => handler },
  "@/lib/rateLimit": { enforceRateLimit: async () => rateLimited },
  "@/lib/jobMarket": { requireJobMarketAccess: async () => marketBlock },
  "@/lib/requestBody": requestBody,
  "@/lib/proofPhotos": { ...lib, purgeProofPhotosSometimes: () => { purgeCalls++; } },
  "@/lib/prisma": { prisma },
  "@/lib/auth": { authOptions: {} },
  "@/lib/testerAdmin": { isTesterAdmin: async () => admin },
  "next-auth": { getServerSession: async () => session },
  "next/server": { NextResponse: { json: (body, init = {}) => new Response(JSON.stringify(body), { status: init.status ?? 200, headers: { "content-type": "application/json", ...(init.headers || {}) } }) } },
};
purgeCalls = 0;
const uploadRoute = load("app/api/jobs/[id]/proof/route.ts", common);
const photoRoute = load("app/api/jobs/[id]/proof/[photoId]/route.ts", common);

const jpeg = await sharp({ create: { width: 800, height: 600, channels: 3, background: "#884400" } }).jpeg().toBuffer();
const ctx = { params: Promise.resolve({ id: "job1" }) };
function formRequest(fields, { bytes = jpeg, name = "p.jpg", type = "image/jpeg", omitFile = false } = {}) {
  const form = new FormData();
  for (const [k, v] of Object.entries(fields)) form.append(k, v);
  if (!omitFile) form.append("file", new File([bytes], name, { type }));
  return new Request("https://x.test/api/jobs/job1/proof", { method: "POST", body: form });
}
const upload = async (fields = { stage: "pickup" }, opts) => { const r = await uploadRoute.POST(formRequest(fields, opts), ctx); return [r.status, await r.json()]; };

// ── upload: access ─────────────────────────────────────────────────────────
reset(); session = null;
eq((await upload())[0], 401, "upload needs a login");
reset(); session = { user: {} };
eq((await upload())[0], 401, "upload needs an account");
reset(); marketBlock = new Response(JSON.stringify({ error: "market" }), { status: 403 });
eq((await upload())[0], 403, "the market guard applies");
eq(photos.length, 0, "nothing saved when the market guard refuses");
reset(); rateLimited = new Response(JSON.stringify({ error: "slow" }), { status: 429 });
eq((await upload())[0], 429, "uploads are rate limited");
reset(); session = { user: { accountId: "poster" } };
eq((await upload())[0], 403, "the poster cannot add proof photos");
reset(); session = { user: { accountId: "stranger" } };
eq((await upload())[0], 403, "an uninvolved account cannot add proof photos");
reset({ acceptedById: null });
eq((await upload())[0], 403, "a job with no driver takes no photos");
eq(photos.length, 0, "nothing saved for refused uploads");

// ── upload: validation ─────────────────────────────────────────────────────
reset();
eq((await upload({ stage: "bogus" }))[0], 400, "an unknown stage is refused");
eq((await upload({}))[0], 400, "a stage is required");
eq((await upload({ stage: "pickup" }, { omitFile: true }))[0], 400, "a file is required");
eq((await upload({ stage: "pickup" }, { bytes: Buffer.from("not an image"), name: "a.jpg" }))[0], 415, "a non-image is refused even with an image name and type");
eq((await upload({ stage: "pickup" }, { bytes: Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'), name: "a.svg", type: "image/svg+xml" }))[0], 415, "SVG is refused");
const notMultipart = await uploadRoute.POST(new Request("https://x.test/p", { method: "POST", body: JSON.stringify({ stage: "pickup" }), headers: { "content-type": "application/json" } }), ctx);
eq(notMultipart.status, 400, "a non-multipart body is refused");
const hugeBody = await uploadRoute.POST(new Request("https://x.test/p", { method: "POST", body: Buffer.alloc(11 * 1024 * 1024), headers: { "content-type": "multipart/form-data; boundary=x" } }), ctx);
eq(hugeBody.status, 413, "an oversize body is refused");
eq(photos.length, 0, "refused uploads save nothing");

// ── upload: stage and status ───────────────────────────────────────────────
reset({ status: "accepted" });
eq((await upload({ stage: "delivery" }))[0], 409, "a delivery photo needs the job in transit");
reset({ status: "in_transit" });
eq((await upload({ stage: "pickup" }))[0], 409, "a pickup photo is not accepted once the job is in transit");
for (const status of ["open", "delivered", "disputed", "completed", "cancelled"]) {
  reset({ status });
  eq([(await upload({ stage: "pickup" }))[0], (await upload({ stage: "delivery" }))[0], photos.length], [409, 409, 0], `no photos while the job is ${status}`);
}

// The status the route read must still hold when the photo is saved.
reset({ status: "accepted" });
const realFind = prisma.job.findUnique; let reads = 0;
prisma.job.findUnique = async (args) => { const row = await realFind(args); if (++reads === 1) job.status = "in_transit"; return row; };
let [code, body] = await upload({ stage: "pickup" });
eq([code, photos.length], [409, 0], "a pickup photo is not saved if the job moved on after the status was read");
prisma.job.findUnique = realFind;

// ── upload: success ────────────────────────────────────────────────────────
reset({ status: "accepted" });
[code, body] = await upload({ stage: "pickup" });
eq(code, 201, "the driver can add a pickup photo");
eq([photos[0].stage, photos[0].uploadedById, photos[0].jobId, photos[0].mimeType], ["pickup", "driver", "job1", "image/jpeg"], "the photo is stored against the job and driver");
ok(Buffer.isBuffer(photos[0].content) && photos[0].content.byteLength === photos[0].sizeBytes, "the stored bytes are the re-encoded image");
ok(photos[0].expiresAt.getTime() - Date.now() > 29 * 86400000 && photos[0].expiresAt.getTime() - Date.now() <= 30 * 86400000, "expiry is 30 days out");
ok(!("content" in body.photo) && !("sha256" in body.photo), "the response carries no image bytes");
eq(purgeCalls, 1, "the expiry cleanup is triggered");

for (let i = 2; i <= 3; i++) eq((await upload({ stage: "pickup" }))[0], 201, `photo ${i} of 3`);
[code, body] = await upload({ stage: "pickup" });
eq([code, photos.length], [409, 3], "a fourth photo at one stage is refused");
job.status = "in_transit";
eq((await upload({ stage: "delivery" }))[0], 201, "the delivery stage has its own allowance");
eq(photos.filter((p) => p.stage === "delivery").length, 1, "one delivery photo");

// ── list and fetch ─────────────────────────────────────────────────────────
const list = async () => { const r = await uploadRoute.GET(new Request("https://x.test/p"), ctx); return [r.status, await r.json(), r]; };
const fetchPhoto = async (id) => photoRoute.GET(new Request("https://x.test/p"), { params: Promise.resolve({ id: "job1", photoId: id }) });

session = null;
eq((await list())[0], 401, "listing needs a login");
eq((await fetchPhoto("p1")).status, 401, "fetching needs a login");

session = { user: { accountId: "stranger" } };
eq((await list())[0], 403, "an uninvolved account cannot list photos");
eq((await fetchPhoto("p1")).status, 403, "an uninvolved account cannot fetch a photo");

for (const who of ["poster", "driver"]) {
  session = { user: { accountId: who } };
  [code, body] = await list();
  eq([code, body.photos.length], [200, 4], `${who} sees the photos`);
  ok(body.photos.every((p) => !("content" in p)), "the list carries no image bytes");
  const response = await fetchPhoto("p1");
  eq(response.status, 200, `${who} can fetch a photo`);
  eq([response.headers.get("content-type"), response.headers.get("cache-control"), response.headers.get("x-content-type-options")], ["image/jpeg", "private, no-store", "nosniff"], "private cache headers and nosniff");
  const served = Buffer.from(await response.arrayBuffer());
  eq((await sharp(served).metadata()).format, "jpeg", "the served bytes are a JPEG");
}

session = { user: { accountId: "stranger" } }; admin = true;
eq([(await list())[0], (await fetchPhoto("p1")).status], [200, 200], "an administrator can list and fetch");
admin = false;
session = { user: { accountId: "poster" } };
eq((await fetchPhoto("missing")).status, 404, "an unknown photo is 404");
marketBlock = new Response("{}", { status: 403 });
eq([(await list())[0], (await fetchPhoto("p1")).status], [403, 403], "the market guard applies to reads");
marketBlock = null;

// A photo id from another job is not reachable through this job.
photos.push({ id: "other", jobId: "job2", stage: "pickup", mimeType: "image/jpeg", sha256: "x", content: jpeg, expiresAt: new Date(Date.now() + 1e9), createdAt: new Date() });
eq((await fetchPhoto("other")).status, 404, "a photo of another job cannot be fetched through this job");
photos.pop();

// Expired photos disappear, unless the job is under review.
photos[0].expiresAt = new Date(Date.now() - 1000);
[code, body] = await list();
eq(body.photos.length, 3, "an expired photo is no longer listed");
eq((await fetchPhoto("p1")).status, 404, "an expired photo cannot be fetched");
job.status = "disputed";
[code, body] = await list();
eq(body.photos.length, 4, "photos on a disputed job stay listed");
eq((await fetchPhoto("p1")).status, 200, "and stay available");

// ── retention purge ────────────────────────────────────────────────────────
reset({ status: "completed" });
const old = new Date(Date.now() - 1000), fresh = new Date(Date.now() + 1e9);
photos = [
  { id: "a", jobId: "job1", expiresAt: old }, { id: "b", jobId: "job1", expiresAt: fresh }, { id: "c", jobId: "job1", expiresAt: old },
];
eq(await lib.purgeExpiredProofPhotos(prisma, new Date()), 2, "expired photos are deleted");
eq(photos.map((p) => p.id), ["b"], "unexpired photos remain");
reset({ status: "disputed" });
photos = [{ id: "a", jobId: "job1", expiresAt: old }];
eq(await lib.purgeExpiredProofPhotos(prisma, new Date()), 0, "photos on a disputed job are never purged");
eq(photos.length, 1, "the disputed job keeps its photos");
job.status = "completed";
eq(await lib.purgeExpiredProofPhotos(prisma, new Date()), 1, "once the dispute is resolved the expired photos go");
eq(await lib.purgeExpiredProofPhotos(prisma, new Date()), 0, "an empty purge is harmless");

const calls = [];
const spy = { jobProofPhoto: { findMany: async () => { calls.push("find"); return []; }, deleteMany: async () => ({ count: 0 }) } };
lib.resetProofPurgeThrottleForTests();
lib.purgeProofPhotosSometimes(spy, new Date());
lib.purgeProofPhotosSometimes(spy, new Date());
await new Promise((r) => setTimeout(r, 10));
eq(calls.length, 1, "the opportunistic purge runs at most once an hour");
lib.resetProofPurgeThrottleForTests();
lib.purgeProofPhotosSometimes({ jobProofPhoto: { findMany: async () => { throw new Error("db down"); }, deleteMany: async () => ({ count: 0 }) } }, new Date());
await new Promise((r) => setTimeout(r, 10));
ok(true, "a failing purge never throws to the caller");

console.log(`Proof photos contract passed (${checks} checks).`);
