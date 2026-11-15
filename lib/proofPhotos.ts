import { createHash } from "node:crypto";
import sharp from "sharp";

/** Photos a driver takes at pickup and delivery. */
export const PROOF_STAGES = ["pickup", "delivery"] as const;
export type ProofStage = (typeof PROOF_STAGES)[number];

export const MAX_PROOF_PHOTOS_PER_STAGE = 3;
export const MAX_PROOF_UPLOAD_BYTES = 10 * 1024 * 1024;
/** Photos are kept this long after upload, or until a dispute on the job is resolved. */
export const PROOF_RETENTION_DAYS = 30;

const MAX_INPUT_PIXELS = 40_000_000;
const MAX_EDGE_PX = 2048;
const ACCEPTED_FORMATS = new Set(["jpeg", "png", "webp"]);
const PURGE_BATCH = 100;
const PURGE_MIN_INTERVAL_MS = 60 * 60 * 1000;

export function isProofStage(value: unknown): value is ProofStage {
  return typeof value === "string" && (PROOF_STAGES as readonly string[]).includes(value);
}

/** The job status in which each stage's photos may be added. */
export const PROOF_STAGE_JOB_STATUS: Record<ProofStage, "accepted" | "in_transit"> = {
  pickup: "accepted",
  delivery: "in_transit",
};

export function proofExpiry(now: Date = new Date()): Date {
  return new Date(now.getTime() + PROOF_RETENTION_DAYS * 24 * 60 * 60 * 1000);
}

export type ProcessedProofPhoto =
  | { ok: true; content: Buffer; mimeType: "image/jpeg"; width: number; height: number; sizeBytes: number; sha256: string }
  | { ok: false; error: string };

/**
 * Decode the upload and write a fresh JPEG. Re-encoding drops all embedded
 * metadata (location, device, timestamps) and anything hidden in the original
 * file; only the pixels survive. The picture is turned upright first.
 */
export async function processProofPhoto(input: Uint8Array): Promise<ProcessedProofPhoto> {
  try {
    const source = Buffer.from(input);
    const meta = await sharp(source, { limitInputPixels: MAX_INPUT_PIXELS, failOn: "error" }).metadata();
    if (!meta.format || !ACCEPTED_FORMATS.has(meta.format)) {
      return { ok: false, error: "Photos must be JPEG, PNG or WebP images." };
    }
    const { data, info } = await sharp(source, { limitInputPixels: MAX_INPUT_PIXELS, failOn: "error" })
      .rotate()
      .resize({ width: MAX_EDGE_PX, height: MAX_EDGE_PX, fit: "inside", withoutEnlargement: true })
      .flatten({ background: "#ffffff" })
      .jpeg({ quality: 80, mozjpeg: true })
      .toBuffer({ resolveWithObject: true });
    return {
      ok: true,
      content: Buffer.from(data),
      mimeType: "image/jpeg",
      width: info.width,
      height: info.height,
      sizeBytes: data.byteLength,
      sha256: createHash("sha256").update(data).digest("hex"),
    };
  } catch {
    return { ok: false, error: "That file could not be read as a photo." };
  }
}

type PurgeClient = {
  jobProofPhoto: {
    findMany(args: unknown): Promise<Array<{ id: string }>>;
    deleteMany(args: unknown): Promise<{ count: number }>;
  };
};

/**
 * Delete expired photos, leaving every photo on a job that is under review.
 * Once the dispute is resolved the job is no longer "disputed" and its
 * (already expired) photos are removed on the next run.
 */
export async function purgeExpiredProofPhotos(client: PurgeClient, now: Date = new Date()): Promise<number> {
  const expired = await client.jobProofPhoto.findMany({
    where: { expiresAt: { lt: now }, job: { status: { not: "disputed" } } },
    select: { id: true },
    take: PURGE_BATCH,
  });
  if (expired.length === 0) return 0;
  const result = await client.jobProofPhoto.deleteMany({ where: { id: { in: expired.map((row) => row.id) } } });
  return result.count;
}

let lastPurgeAt = 0;

/** Run the purge at most once an hour per server process, without delaying the caller. */
export function purgeProofPhotosSometimes(client: PurgeClient, now: Date = new Date()): void {
  if (now.getTime() - lastPurgeAt < PURGE_MIN_INTERVAL_MS) return;
  lastPurgeAt = now.getTime();
  purgeExpiredProofPhotos(client, now).catch((error) => {
    console.error("Proof photo expiry cleanup failed.", { message: error instanceof Error ? error.message : "unknown" });
  });
}

/** Test helper: allow the throttle to run again. */
export function resetProofPurgeThrottleForTests() {
  lastPurgeAt = 0;
}
