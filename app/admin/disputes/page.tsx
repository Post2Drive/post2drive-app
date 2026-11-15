"use client";

import { useCallback, useEffect, useState } from "react";
import { DISPUTE_OUTCOMES, DISPUTE_REASON_LABELS } from "@/lib/disputes";

type DisputeMetadata = {
  reason?: string;
  notes?: string;
  openedByRole?: string;
  automatic?: boolean;
  rejectionCount?: number;
} | null;

type DisputeJob = {
  id: string;
  pickup: string;
  dropoff: string;
  createdAt: string;
  deliveryMarkedById: string | null;
  activities: { id: string; createdAt: string; metadata: DisputeMetadata }[];
};

type Photo = { id: string; stage: "pickup" | "delivery"; width: number; height: number; createdAt: string };

const PROOF_STAGE_LABELS = { pickup: "At pickup", delivery: "At drop-off" } as const;
const OUTCOME_KEYS = Object.keys(DISPUTE_OUTCOMES);
const when = (value: string) => new Date(value).toLocaleString("en-GB", { dateStyle: "medium", timeStyle: "short" });

function opener(meta: DisputeMetadata) {
  if (meta?.automatic) return "Opened automatically after a second rejected delivery";
  if (meta?.openedByRole === "driver") return "Opened by the driver";
  if (meta?.openedByRole === "poster") return "Opened by the poster";
  return "Opener not recorded";
}

function Photos({ jobId }: { jobId: string }) {
  const [photos, setPhotos] = useState<Photo[] | null>(null);
  const [failed, setFailed] = useState(false);
  useEffect(() => {
    let live = true;
    fetch(`/api/jobs/${jobId}/proof`, { cache: "no-store" })
      .then((response) => (response.ok ? response.json() : Promise.reject(new Error("failed"))))
      .then((data) => { if (live) setPhotos(data.photos || []); })
      .catch(() => { if (live) setFailed(true); });
    return () => { live = false; };
  }, [jobId]);

  if (failed) return <p role="alert" className="dispute-message dispute-message-error">Photos could not be loaded.</p>;
  if (!photos) return <p className="dispute-note">Loading photos…</p>;
  if (photos.length === 0) return <p className="dispute-note">No photos were added to this job.</p>;
  return (
    <ul className="dispute-photos" aria-label="Photos on this job">
      {photos.map((photo, index) => (
        <li key={photo.id}>
          <a href={`/api/jobs/${jobId}/proof/${photo.id}`} target="_blank" rel="noopener noreferrer">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={`/api/jobs/${jobId}/proof/${photo.id}`} alt={`${PROOF_STAGE_LABELS[photo.stage]} photo ${index + 1}, added ${when(photo.createdAt)}`}
              width={120} height={90} loading="lazy" />
            <span>{PROOF_STAGE_LABELS[photo.stage]} (opens full size)</span>
          </a>
        </li>
      ))}
    </ul>
  );
}

/*
 * Admin dispute queue. Used a few times a day, so no motion (Emil: frequency-based
 * motion decisions). Native radios/textarea, visible status, the server re-checks
 * every rule. No automatic penalty: the outcome and written reason are the record.
 */
export default function DisputesAdminPage() {
  const [disputes, setDisputes] = useState<DisputeJob[]>([]);
  const [message, setMessage] = useState<{ text: string; error: boolean }>({ text: "Loading disputes…", error: false });
  const [busyId, setBusyId] = useState("");
  const [outcomes, setOutcomes] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/disputes/resolve", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to load disputes.");
      setDisputes(data.disputes || []);
      setMessage({ text: (data.disputes || []).length ? "" : "No jobs are under review.", error: false });
    } catch (error) {
      setMessage({ text: error instanceof Error ? error.message : "Unable to load disputes.", error: true });
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function resolve(job: DisputeJob) {
    setBusyId(job.id);
    setMessage({ text: "", error: false });
    try {
      const response = await fetch("/api/admin/disputes/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ jobId: job.id, outcome: outcomes[job.id], notes: (notes[job.id] || "").trim() }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to resolve this dispute.");
      setDisputes((current) => current.filter((item) => item.id !== job.id));
      setMessage({ text: `${job.pickup} to ${job.dropoff}: resolved. Both parties were notified and the decision is on the job record.`, error: false });
    } catch (error) {
      setMessage({ text: error instanceof Error ? error.message : "Unable to resolve this dispute.", error: true });
    } finally {
      setBusyId("");
    }
  }

  return (
    <main className="dispute-page">
      <h1>Disputes under review</h1>
      <p className="dispute-lead">
        Read both sides and look at the photos before deciding. No outcome applies an automatic penalty; record your reasoning in writing.
        Suspension for criminal or gross misconduct is handled separately.
      </p>
      {message.text ? (
        <p role={message.error ? "alert" : "status"} className={message.error ? "dispute-message dispute-message-error" : "dispute-message"}>
          {message.text}
        </p>
      ) : null}
      <div className="dispute-list">
        {disputes.map((job) => {
          const meta = job.activities[0]?.metadata ?? null;
          const reasonLabel = meta?.reason ? DISPUTE_REASON_LABELS[meta.reason as keyof typeof DISPUTE_REASON_LABELS] ?? meta.reason : "Not recorded";
          const notesId = `notes-${job.id}`;
          const hintId = `hint-${job.id}`;
          const selected = outcomes[job.id] || "";
          const written = (notes[job.id] || "").trim();
          const blocked = selected === "completed" && !job.deliveryMarkedById;
          return (
            <section key={job.id} aria-labelledby={`dispute-${job.id}`} className="dispute-card">
              <h2 id={`dispute-${job.id}`}>{job.pickup} to {job.dropoff}</h2>
              <dl className="dispute-facts">
                <div><dt>Reason: </dt><dd>{reasonLabel}</dd></div>
                <div><dt>How it started: </dt><dd>{opener(meta)}{job.activities[0] ? `, ${when(job.activities[0].createdAt)}` : ""}</dd></div>
                <div><dt>Delivery marked: </dt><dd>{job.deliveryMarkedById ? "Yes" : "No"}</dd></div>
                {meta?.rejectionCount ? <div><dt>Deliveries rejected: </dt><dd>{meta.rejectionCount}</dd></div> : null}
              </dl>
              {meta?.notes ? <p className="dispute-account"><strong>Their account: </strong>{meta.notes}</p> : null}
              <Photos jobId={job.id} />
              <form className="dispute-form" onSubmit={(event) => { event.preventDefault(); void resolve(job); }}>
                <fieldset className="dispute-fieldset">
                  <legend>Outcome</legend>
                  <div>
                    {OUTCOME_KEYS.map((key) => {
                      const id = `outcome-${job.id}-${key}`;
                      return (
                        <label key={key} htmlFor={id} className="dispute-option">
                          <input id={id} type="radio" name={`outcome-${job.id}`} value={key} checked={selected === key}
                            onChange={() => setOutcomes((current) => ({ ...current, [job.id]: key }))} />
                          <span>{DISPUTE_OUTCOMES[key].label}</span>
                        </label>
                      );
                    })}
                  </div>
                </fieldset>
                <label htmlFor={notesId} className="dispute-reason-label">Written reason (sent to both parties, up to 4000 characters)</label>
                <textarea id={notesId} aria-describedby={hintId} maxLength={4000} rows={4} value={notes[job.id] || ""}
                  onChange={(event) => setNotes((current) => ({ ...current, [job.id]: event.target.value }))}
                  />
                <p id={hintId} className="dispute-hint">
                  {blocked ? "Delivery was never marked, so this job cannot be completed. Return it to transit or cancel it. " : ""}
                  Choose an outcome and write a reason to resolve.
                </p>
                <button type="submit" disabled={Boolean(busyId) || !selected || !written || blocked}
                  className="dispute-resolve">
                  {busyId === job.id ? "Saving…" : "Resolve dispute"}
                </button>
              </form>
            </section>
          );
        })}
      </div>
    </main>
  );
}
