"use client";

import { useEffect, useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

type IncidentEvent = {
  id: string;
  action: string;
  description: string | null;
  createdAt: string;
  metadata: unknown;
  evidenceFiles?: { id: string; fileName: string; mimeType: string; sizeBytes: number; sha256: string; createdAt: string; uploadedById: string }[];
};

const reasons = [
  ["vehicle_breakdown", "Vehicle breakdown"],
  ["health_emergency", "Health emergency"],
  ["wrong_load", "Wrong load / booking mismatch"],
  ["unsafe_load", "Unsafe or improperly secured load"],
  ["accident", "Accident"],
  ["delay", "Delay"],
  ["pickup_problem", "Pickup problem"],
  ["delivery_damage", "Delivery damage"],
  ["contact_issue", "Unable to contact the other party"],
  ["payment_dispute", "Payment dispute"],
  ["other", "Other"],
];

export default function IncidentPanel({ jobId, jobStatus }: { jobId: string; jobStatus: string }) {
  const [events, setEvents] = useState<IncidentEvent[]>([]);
  const [reason, setReason] = useState("vehicle_breakdown");
  const [description, setDescription] = useState("");
  const [location, setLocation] = useState("");
  const [requestedOutcome, setRequestedOutcome] = useState("reassign");
  const [evidence, setEvidence] = useState("");
  const [updateText, setUpdateText] = useState<Record<string, string>>({});
  const [terminationNotes, setTerminationNotes] = useState<Record<string, string>>({});
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function load() {
    const response = await fetch(`/api/jobs/${jobId}/incidents`, { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Could not load incident history.");
    setEvents(data.incidents || []);
  }

  useEffect(() => {
    load().catch((error) => setMessage(error.message));
  }, [jobId]);

  async function report(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`/api/jobs/${jobId}/incidents`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          reason,
          description,
          location,
          requestedOutcome,
          evidence: evidence.split("\n").map((value) => value.trim()).filter(Boolean),
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Incident report failed.");
      setDescription("");
      setEvidence("");
      setMessage("Incident recorded. The job status has not been changed.");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Incident report failed.");
    } finally {
      setBusy(false);
    }
  }

  async function uploadEvidence(incidentId: string, file: File) {
    setBusy(true);
    setMessage("");
    try {
      const form = new FormData();
      form.append("file", file);
      const response = await fetch(`/api/jobs/${jobId}/incidents/${incidentId}/evidence`, {
        method: "POST",
        body: form,
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Evidence upload failed.");
      setMessage("Evidence stored with the incident record.");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Evidence upload failed.");
    } finally {
      setBusy(false);
    }
  }

  async function terminateWithIncident(event: IncidentEvent) {
    setBusy(true);
    setMessage("");
    try {
      const metadata = (event.metadata || {}) as { reason?: string };
      const response = await fetch(`/api/jobs/${jobId}/incidents/terminate`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          incidentId: event.id,
          reason: metadata.reason || "other",
          notes: terminationNotes[event.id] || "",
          evidence: [],
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not terminate job with incident.");
      setMessage("Job terminated with the incident preserved. Pickup and delivery history remain in the audit trail.");
      await load();
      router.refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not terminate job with incident.");
    } finally {
      setBusy(false);
    }
  }

  async function addUpdate(incidentId: string) {
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch(`/api/jobs/${jobId}/incidents/updates`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          incidentId,
          description: updateText[incidentId] || "",
          evidence: [],
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not add incident update.");
      setUpdateText((current) => ({ ...current, [incidentId]: "" }));
      setMessage("Update added to the incident history.");
      await load();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not add incident update.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ display: "grid", gap: 24 }}>
      <section style={{ border: "1px solid var(--color-border)", borderRadius: 12, padding: 18 }}>
        <h2 style={{ marginTop: 0 }}>Report an incident</h2>
        <p>If someone is in immediate danger, contact emergency services first. You can report an incident without cancelling the job; the original job and pickup/delivery history are preserved.</p>
        <form onSubmit={report} style={{ display: "grid", gap: 12 }}>
          <label>Reason
            <select value={reason} onChange={(e) => setReason(e.target.value)} style={{ display: "block", width: "100%", padding: 10, marginTop: 4 }}>
              {reasons.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label>What happened?
            <textarea required maxLength={4000} value={description} onChange={(e) => setDescription(e.target.value)} rows={4} style={{ display: "block", width: "100%", padding: 10, marginTop: 4 }} />
          </label>
          <label>Location (optional)
            <input maxLength={300} value={location} onChange={(e) => setLocation(e.target.value)} style={{ display: "block", width: "100%", padding: 10, marginTop: 4 }} />
          </label>
          <label>Requested next step
            <select value={requestedOutcome} onChange={(e) => setRequestedOutcome(e.target.value)} style={{ display: "block", width: "100%", padding: 10, marginTop: 4 }}>
              <option value="resume">Resume delivery</option>
              <option value="reassign">Replacement driver or vehicle</option>
              <option value="return_goods">Arrange return of goods</option>
              <option value="terminate_with_incident">Terminate with incident recorded</option>
              <option value="delivery_dispute">Delivery/damage dispute</option>
              <option value="payment_dispute">Payment dispute</option>
              <option value="support_review">Support review</option>
            </select>
          </label>
          <label>Evidence links (optional, one HTTPS link per line)
            <textarea value={evidence} onChange={(e) => setEvidence(e.target.value)} rows={3} placeholder="Use links you are authorised to share. Do not paste passwords or private access tokens." style={{ display: "block", width: "100%", padding: 10, marginTop: 4 }} />
          </label>
          <button disabled={busy} type="submit" style={{ padding: "10px 14px", cursor: busy ? "wait" : "pointer" }}>{busy ? "Saving…" : "Submit incident report"}</button>
        </form>
      </section>

      {message && <p role="status" aria-live="polite">{message}</p>}

      <section>
        <h2>Incident history</h2>
        {events.length === 0 ? <p>No incident reports yet.</p> : <div style={{ display: "grid", gap: 12 }}>
          {events.map((event) => (
            <article key={event.id} style={{ border: "1px solid var(--color-border)", borderRadius: 12, padding: 16 }}>
              <p style={{ marginTop: 0, fontSize: 12, color: "var(--color-muted)" }}>{new Date(event.createdAt).toLocaleString()} · {event.action.replaceAll("_", " ").toLowerCase()}</p>
              <p>{event.description}</p>
              <details>
                <summary>Incident details and recorded metadata</summary>
                <pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{JSON.stringify(event.metadata, null, 2)}</pre>
              </details>
              {event.action === "INCIDENT_REPORTED" && (
                <div style={{ marginTop: 12 }}>
                  <strong>Uploaded evidence</strong>
                  {event.evidenceFiles?.length ? (
                    <ul>
                      {event.evidenceFiles.map((file) => (
                        <li key={file.id}>
                          <a href={`/api/jobs/${jobId}/incidents/${event.id}/evidence/${file.id}`}>{file.fileName}</a>
                          {" · "}{file.mimeType} · {Math.ceil(file.sizeBytes / 1024)} KB
                          <details><summary>Integrity hash</summary><code>{file.sha256}</code></details>
                        </li>
                      ))}
                    </ul>
                  ) : <p>No files uploaded yet.</p>}
                  <label>Upload photo or PDF (JPEG, PNG, WebP, PDF; maximum 5 MB each)
                    <input
                      type="file"
                      accept="image/jpeg,image/png,image/webp,application/pdf"
                      disabled={busy}
                      onChange={(e) => {
                        const input = e.currentTarget;
                        const file = input.files?.[0];
                        if (file) uploadEvidence(event.id, file).finally(() => { input.value = ""; });
                      }}
                      style={{ display: "block", marginTop: 6, maxWidth: "100%" }}
                    />
                  </label>
                </div>
              )}
              {event.action === "INCIDENT_REPORTED" && jobStatus !== "delivered" && jobStatus !== "completed" && jobStatus !== "cancelled" && ["vehicle_breakdown", "health_emergency", "wrong_load", "unsafe_load", "accident", "delay", "pickup_problem", "delivery_damage", "other"].includes(String((event.metadata as any)?.reason)) && (
                <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
                  <label>Reason job cannot continue (required for incident termination)
                    <textarea required maxLength={4000} value={terminationNotes[event.id] || ""} onChange={(e) => setTerminationNotes((current) => ({ ...current, [event.id]: e.target.value }))} rows={2} style={{ display: "block", width: "100%", padding: 10, marginTop: 4 }} />
                  </label>
                  <button disabled={busy || !(terminationNotes[event.id] || "").trim()} onClick={() => terminateWithIncident(event)} style={{ padding: "8px 12px" }}>Terminate job with this incident</button>
                  <p style={{ fontSize: 12, color: "var(--color-muted)" }}>Use for a genuine breakdown, health/safety issue, wrong load or another reason the job cannot continue. This bypasses ordinary cancellation frequency limits but creates an auditable incident record. For a job already marked delivered, use a dispute instead.</p>
                </div>
              )}
              {event.action === "INCIDENT_REPORTED" && (
                <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
                  <label>Add a follow-up note
                    <textarea maxLength={4000} value={updateText[event.id] || ""} onChange={(e) => setUpdateText((current) => ({ ...current, [event.id]: e.target.value }))} rows={2} style={{ display: "block", width: "100%", padding: 10, marginTop: 4 }} />
                  </label>
                  <button disabled={busy || !(updateText[event.id] || "").trim()} onClick={() => addUpdate(event.id)} style={{ padding: "8px 12px" }}>Add update</button>
                </div>
              )}
            </article>
          ))}
        </div>}
      </section>
    </div>
  );
}
