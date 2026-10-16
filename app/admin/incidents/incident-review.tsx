"use client";

import { useCallback, useEffect, useState } from "react";

type Incident = {
  id: string;
  jobId: string;
  description: string | null;
  createdAt: string;
  metadata: any;
  actor: { displayId: string; companyName: string } | null;
  job: { id: string; status: string; pickup: string; dropoff: string; posterId: string; acceptedById: string | null };
  resolutions: { id: string; description: string | null; createdAt: string; metadata: any }[];
  evidenceFiles: { id: string; incidentId: string; fileName: string; mimeType: string; sizeBytes: number; sha256: string; createdAt: string }[];
};

const outcomes = [
  ["resume", "Resume job"],
  ["reassign", "Arrange reassignment (manual coordination)"],
  ["return_goods", "Arrange return of goods (manual coordination)"],
  ["terminate_with_incident", "Terminate with incident preserved"],
  ["delivery_dispute", "Delivery/damage dispute"],
  ["payment_dispute", "Payment dispute"],
  ["no_further_action", "No further action"],
];

export default function IncidentReview() {
  const [incidents, setIncidents] = useState<Incident[]>([]);
  const [outcome, setOutcome] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [message, setMessage] = useState("");
  const [busyId, setBusyId] = useState("");

  const refresh = useCallback(async () => {
    const response = await fetch("/api/admin/incidents/resolve", { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Could not load incidents.");
    setIncidents(data.incidents || []);
  }, []);

  useEffect(() => {
    refresh().catch((error) => setMessage(error instanceof Error ? error.message : "Could not load incidents."));
  }, [refresh]);

  async function recordDecision(incident: Incident) {
    setBusyId(incident.id);
    setMessage("");
    try {
      const response = await fetch("/api/admin/incidents/resolve", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          jobId: incident.jobId,
          incidentId: incident.id,
          outcome: outcome[incident.id] || "no_further_action",
          notes: notes[incident.id] || "",
        }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not record support decision.");
      setMessage(data.lifecycleChanged
        ? `Job status changed to ${data.jobStatus}. The termination and decision were recorded in the audit history, active bids were invalidated, and the parties were notified.`
        : "Decision recorded in the audit history and parties notified. Recovery, reassignment, return of goods and commercial arrangements still require manual coordination.");
      await refresh();
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not record support decision.");
    } finally {
      setBusyId("");
    }
  }

  return (
    <section style={{ display: "grid", gap: 14 }}>
      {message && <p role="status" aria-live="polite">{message}</p>}
      <p>Record a support decision with notes. “Terminate with incident preserved” conditionally terminates an accepted/in-transit job and invalidates active bids. Resume, reassignment, return of goods and commercial/payment arrangements are recorded decisions only and require manual coordination.</p>
      {incidents.length === 0 ? <p>No incident reports found.</p> : incidents.map((incident) => (
        <article key={incident.id} style={{ border: "1px solid var(--color-border)", borderRadius: 12, padding: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
            <h2 style={{ margin: 0, fontSize: 18 }}>{String(incident.metadata?.reason || "incident").replaceAll("_", " ")}</h2>
            <span>{new Date(incident.createdAt).toLocaleString()}</span>
          </div>
          <p><strong>Job:</strong> {incident.jobId} · <strong>State:</strong> {incident.job.status.replaceAll("_", " ")}</p>
          <p>{incident.job.pickup} → {incident.job.dropoff}</p>
          <p><strong>Reported by:</strong> {incident.actor?.companyName || "Account"} ({incident.actor?.displayId || "—"})</p>
          <p>{incident.description}</p>
          {incident.metadata?.location && <p><strong>Location:</strong> {incident.metadata.location}</p>}
          {incident.metadata?.requestedOutcome && <p><strong>Requested outcome:</strong> {String(incident.metadata.requestedOutcome).replaceAll("_", " ")}</p>}
          {incident.resolutions?.length > 0 && (
            <section style={{ marginTop: 12, padding: 12, background: "var(--color-surface)", borderRadius: 8 }}>
              <strong>Previous support decisions</strong>
              {incident.resolutions.map((resolution) => (
                <div key={resolution.id} style={{ borderTop: "1px solid var(--color-border)", marginTop: 8, paddingTop: 8 }}>
                  <p>{resolution.description}</p>
                  <p style={{ fontSize: 12, color: "var(--color-muted)" }}>{new Date(resolution.createdAt).toLocaleString()} · {String(resolution.metadata?.outcome || "").replaceAll("_", " ")}</p>
                  <p>{resolution.metadata?.notes}</p>
                </div>
              ))}
            </section>
          )}
          {Array.isArray(incident.metadata?.evidence) && incident.metadata.evidence.length > 0 && (
            <div><strong>Evidence references</strong><ul>{incident.metadata.evidence.map((url: string, i: number) => <li key={i}><a href={url} target="_blank" rel="noopener noreferrer">Open evidence reference {i + 1}</a></li>)}</ul></div>
          )}
          {incident.evidenceFiles?.length > 0 && (
            <div>
              <strong>Uploaded evidence files</strong>
              <ul>
                {incident.evidenceFiles.map((file) => (
                  <li key={file.id}>
                    <a href={`/api/jobs/${incident.jobId}/incidents/${incident.id}/evidence/${file.id}`}>{file.fileName}</a>
                    {" · "}{file.mimeType} · {Math.ceil(file.sizeBytes / 1024)} KB
                    <details><summary>Integrity hash</summary><code>{file.sha256}</code></details>
                  </li>
                ))}
              </ul>
            </div>
          )}
          <div style={{ display: "grid", gap: 10, marginTop: 14 }}>
            {(outcome[incident.id] || "no_further_action") === "terminate_with_incident" && (
              <p role="note">This will change an accepted/in-transit job to cancelled. It cannot be used after delivery is marked, and the previous pickup/delivery activity history will be preserved.</p>
            )}
            <label>Support decision
              <select value={outcome[incident.id] || "no_further_action"} onChange={(e) => setOutcome((current) => ({ ...current, [incident.id]: e.target.value }))} style={{ display: "block", width: "100%", padding: 10, marginTop: 4 }}>
                {outcomes.map(([value, label]) => <option key={value} value={value} disabled={value === "terminate_with_incident" && incident.job.status !== "accepted" && incident.job.status !== "in_transit"}>{label}</option>)}
              </select>
            </label>
            <label>Decision notes (required)
              <textarea required maxLength={4000} value={notes[incident.id] || ""} onChange={(e) => setNotes((current) => ({ ...current, [incident.id]: e.target.value }))} rows={3} style={{ display: "block", width: "100%", padding: 10, marginTop: 4 }} />
            </label>
            <button disabled={busyId === incident.id || !(notes[incident.id] || "").trim() || ((outcome[incident.id] || "no_further_action") === "terminate_with_incident" && incident.job.status !== "accepted" && incident.job.status !== "in_transit")} onClick={() => recordDecision(incident)} style={{ padding: "10px 14px" }}>{busyId === incident.id ? "Recording…" : incident.resolutions?.length ? "Record updated decision and notify parties" : "Record decision and notify parties"}</button>
          </div>
        </article>
      ))}
    </section>
  );
}
