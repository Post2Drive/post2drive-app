"use client";

import { useRef, useState, type ChangeEvent, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import { DISPUTE_REASONS, DISPUTE_REASON_LABELS, type DisputeReason } from "@/lib/disputes";
import {
  MAX_PROOF_PHOTOS_PER_STAGE,
  PROOF_RETENTION_DAYS,
  PROOF_STAGES,
  PROOF_STAGE_JOB_STATUSES,
  PROOF_STAGE_LABELS,
  type ProofStage,
} from "@/lib/proofStages";

export type ProofPhotoView = {
  id: string;
  stage: ProofStage;
  width: number;
  height: number;
  createdAt: string;
  by: "poster" | "driver";
  mine: boolean;
};

export type DisputeSummary = {
  reasonLabel: string;
  notes: string;
  openedByRole: "poster" | "driver";
  automatic: boolean;
  openedAt: string | null;
};

type Props = {
  jobId: string;
  status: string;
  role: "poster" | "driver";
  photosRequired: boolean;
  initialPhotos: ProofPhotoView[];
  dispute: DisputeSummary | null;
};

const NOTES_MAX = 4000;
const REQUIRED_HINT: Record<ProofStage, string> = {
  pickup: "The driver must add a photo before pickup can be confirmed.",
  delivery: "The driver must add a photo before the job can be marked delivered.",
};

function whoLabel(photo: ProofPhotoView) {
  return photo.mine ? "you" : photo.by === "driver" ? "the driver" : "the poster";
}

/*
 * Photos and problems for one job. Used a few times per job, not all day, so it
 * has no entrance motion (Emil: frequency decides). The disclosure for the
 * problem form opens in place with no animation and moves focus to its first
 * field; nothing moves under the cursor. Native controls throughout, errors are
 * announced, and every state is carried by words, not colour alone.
 */
export default function ProofPanel({ jobId, status, role, photosRequired, initialPhotos, dispute }: Props) {
  const router = useRouter();
  const [photos, setPhotos] = useState<ProofPhotoView[]>(initialPhotos);
  const [uploading, setUploading] = useState<ProofStage | null>(null);
  const [photoError, setPhotoError] = useState<{ stage: ProofStage; text: string } | null>(null);
  const [photoNotice, setPhotoNotice] = useState("");

  const [formOpen, setFormOpen] = useState(false);
  const [reason, setReason] = useState<DisputeReason>("goods_damaged");
  const [notes, setNotes] = useState("");
  const [sending, setSending] = useState(false);
  const [formError, setFormError] = useState("");
  const reasonRef = useRef<HTMLSelectElement>(null);
  const openButtonRef = useRef<HTMLButtonElement>(null);

  const canDispute = status === "in_transit" || status === "delivered";

  async function refreshPhotos() {
    const response = await fetch(`/api/jobs/${jobId}/proof`, { cache: "no-store" });
    const data = await response.json().catch(() => ({}));
    if (response.ok && Array.isArray(data.photos)) setPhotos(data.photos);
  }

  async function upload(stage: ProofStage, event: ChangeEvent<HTMLInputElement>) {
    const input = event.target;
    const file = input.files?.[0];
    if (!file) return;
    setPhotoError(null);
    setPhotoNotice("");
    setUploading(stage);
    try {
      const form = new FormData();
      form.append("stage", stage);
      form.append("file", file);
      const response = await fetch(`/api/jobs/${jobId}/proof`, { method: "POST", body: form });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setPhotoError({ stage, text: data.error || "The photo could not be added. Try again." });
        return;
      }
      setPhotoNotice(`${PROOF_STAGE_LABELS[stage]} photo added.`);
      await refreshPhotos();
    } catch {
      setPhotoError({ stage, text: "The photo could not be added. Check your connection and try again." });
    } finally {
      setUploading(null);
      input.value = "";
    }
  }

  function openForm() {
    setFormOpen(true);
    // The form mounts on the next paint; move focus to its first field.
    requestAnimationFrame(() => reasonRef.current?.focus());
  }

  function closeForm() {
    setFormOpen(false);
    setFormError("");
    requestAnimationFrame(() => openButtonRef.current?.focus());
  }

  async function sendDispute(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const text = notes.trim();
    if (!text) {
      setFormError("Say what went wrong so our team can look into it.");
      return;
    }
    setSending(true);
    setFormError("");
    try {
      const response = await fetch(`/api/jobs/${jobId}/dispute`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ reason, notes: text }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setFormError(data.error || "Could not send this for review. Try again.");
        return;
      }
      setFormOpen(false);
      router.refresh();
    } catch {
      setFormError("Could not send this for review. Check your connection and try again.");
    } finally {
      setSending(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: 24, marginTop: 16 }}>
      {dispute && (
        <section aria-labelledby="review-heading" className="proof-banner">
          <h2 id="review-heading" style={{ margin: "0 0 6px", fontSize: 20 }}>Under review</h2>
          <p style={{ margin: "0 0 8px" }}>
            {dispute.automatic
              ? "Delivery was rejected twice, so this job was sent for review."
              : `${dispute.openedByRole === role ? "You" : dispute.openedByRole === "driver" ? "The driver" : "The poster"} opened a dispute.`}{" "}
            Nothing about the job can change until our team decides. The photos below stay available until then.
          </p>
          <p style={{ margin: 0 }}><strong>Reason:</strong> {dispute.reasonLabel}</p>
          {dispute.notes && <p style={{ margin: "6px 0 0" }}><strong>What was said:</strong> {dispute.notes}</p>}
        </section>
      )}

      <section aria-labelledby="photos-heading">
        <h2 id="photos-heading" style={{ fontSize: 22, margin: "0 0 4px" }}>Photos</h2>
        <p style={{ margin: "0 0 16px", color: "var(--color-muted)" }}>
          Photos of the goods protect both sides if something goes wrong. Either of you can add up to {MAX_PROOF_PHOTOS_PER_STAGE} photos at each stage.
          They are kept for {PROOF_RETENTION_DAYS} days, longer if a dispute is open. Location and camera details are removed from every photo.
        </p>

        <div aria-live="polite" aria-atomic="true" className="proof-notice">{photoNotice}</div>

        <div style={{ display: "grid", gap: 20 }}>
          {PROOF_STAGES.map((stage) => {
            const stagePhotos = photos.filter((photo) => photo.stage === stage);
            const mine = stagePhotos.filter((photo) => photo.mine).length;
            const stageOpen = PROOF_STAGE_JOB_STATUSES[stage].includes(status);
            const atLimit = mine >= MAX_PROOF_PHOTOS_PER_STAGE;
            const driverHas = stagePhotos.some((photo) => photo.by === "driver");
            const inputId = `proof-${stage}`;
            const errorId = `proof-${stage}-error`;
            const error = photoError?.stage === stage ? photoError.text : "";
            return (
              <section key={stage} aria-labelledby={`${inputId}-heading`} className="proof-stage">
                <h3 id={`${inputId}-heading`} style={{ fontSize: 18, margin: "0 0 4px" }}>{PROOF_STAGE_LABELS[stage]}</h3>

                {photosRequired && (driverHas || stageOpen) && (
                  <p style={{ margin: "0 0 8px", fontWeight: 600 }}>
                    {driverHas ? "The driver has added a photo." : REQUIRED_HINT[stage]}
                  </p>
                )}

                {stagePhotos.length === 0 ? (
                  <p style={{ margin: "0 0 8px", color: "var(--color-muted)" }}>No photos yet.</p>
                ) : (
                  <ul className="proof-grid" aria-label={`${PROOF_STAGE_LABELS[stage]} photos`}>
                    {stagePhotos.map((photo, index) => {
                      const src = `/api/jobs/${jobId}/proof/${photo.id}`;
                      return (
                        <li key={photo.id}>
                          <a href={src} target="_blank" rel="noopener noreferrer" className="proof-thumb"
                            aria-label={`Open ${PROOF_STAGE_LABELS[stage].toLowerCase()} photo ${index + 1} full size, added by ${whoLabel(photo)} (opens in a new tab)`}>
                            {/* Private, authenticated image; next/image optimisation does not apply. */}
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img src={src} alt={`${PROOF_STAGE_LABELS[stage]} photo ${index + 1}, added by ${whoLabel(photo)}`}
                              width={photo.width} height={photo.height} loading="lazy" decoding="async" />
                          </a>
                          <span className="proof-caption">Added by {whoLabel(photo)}</span>
                        </li>
                      );
                    })}
                  </ul>
                )}

                {stageOpen ? (
                  <div>
                    <label htmlFor={inputId} style={{ display: "block", fontWeight: 600, marginBottom: 6 }}>
                      Add a photo {stage === "pickup" ? "at pickup" : "at drop-off"}
                    </label>
                    <input
                      id={inputId}
                      type="file"
                      accept="image/jpeg,image/png,image/webp"
                      capture="environment"
                      disabled={uploading !== null || atLimit}
                      aria-describedby={error ? errorId : `${inputId}-help`}
                      aria-invalid={error ? true : undefined}
                      onChange={(event) => upload(stage, event)}
                      className="proof-file"
                    />
                    <p id={`${inputId}-help`} style={{ margin: "6px 0 0", fontSize: 14, color: "var(--color-muted)" }}>
                      {uploading === stage
                        ? "Uploading…"
                        : atLimit
                          ? `You have added the most photos allowed here (${MAX_PROOF_PHOTOS_PER_STAGE}).`
                          : `You have added ${mine} of ${MAX_PROOF_PHOTOS_PER_STAGE}. JPEG, PNG or WebP, up to 10 MB.`}
                    </p>
                    {error && <p id={errorId} role="alert" className="proof-error">{error}</p>}
                  </div>
                ) : (
                  <p style={{ margin: 0, color: "var(--color-muted)" }}>
                    {status === "disputed"
                      ? "Photos can't be added while the job is under review."
                      : "Photos can't be added at this stage of the job."}
                  </p>
                )}
              </section>
            );
          })}
        </div>
      </section>

      {canDispute && (
        <section aria-labelledby="problem-heading" className="proof-stage">
          <h2 id="problem-heading" style={{ fontSize: 22, margin: "0 0 4px" }}>Something went wrong?</h2>
          <p style={{ margin: "0 0 12px", color: "var(--color-muted)" }}>
            If the goods are damaged, missing or not delivered, or you can't agree, send the job for review. It is frozen until our team has looked at the photos and what you both say, and then decides. There is no automatic penalty.
          </p>
          {!formOpen ? (
            <button ref={openButtonRef} type="button" className="proof-button button-link-secondary" aria-expanded={false} aria-controls="dispute-form" onClick={openForm}>
              Report a problem with this delivery
            </button>
          ) : (
            <form id="dispute-form" onSubmit={sendDispute} noValidate style={{ display: "grid", gap: 12 }}>
              <div>
                <label htmlFor="dispute-reason" style={{ display: "block", fontWeight: 600, marginBottom: 6 }}>What went wrong?</label>
                <select id="dispute-reason" ref={reasonRef} value={reason} onChange={(event) => setReason(event.target.value as DisputeReason)} className="proof-field">
                  {DISPUTE_REASONS.map((value) => (
                    <option key={value} value={value}>{DISPUTE_REASON_LABELS[value]}</option>
                  ))}
                </select>
              </div>
              <div>
                <label htmlFor="dispute-notes" style={{ display: "block", fontWeight: 600, marginBottom: 6 }}>Tell us what happened</label>
                <textarea id="dispute-notes" value={notes} onChange={(event) => setNotes(event.target.value)} rows={5} maxLength={NOTES_MAX}
                  aria-describedby={formError ? "dispute-error" : "dispute-count"} aria-invalid={formError ? true : undefined} required className="proof-field" />
                <p id="dispute-count" style={{ margin: "4px 0 0", fontSize: 14, color: "var(--color-muted)" }}>{notes.length} of {NOTES_MAX} characters</p>
              </div>
              {formError && <p id="dispute-error" role="alert" className="proof-error">{formError}</p>}
              <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
                <button type="submit" className="proof-button proof-button-primary" disabled={sending}>
                  {sending ? "Sending…" : "Send for review"}
                </button>
                <button type="button" className="proof-button button-link-secondary" onClick={closeForm} disabled={sending}>Cancel</button>
              </div>
            </form>
          )}
        </section>
      )}
    </div>
  );
}
