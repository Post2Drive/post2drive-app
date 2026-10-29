"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { collectPilotDiagnostics, PILOT_DIAGNOSTICS_STORAGE_KEY, type PilotDiagnostics } from "@/lib/pilotDiagnostics";

const categories = [
  ["layout", "Screen layout / sizing"],
  ["navigation", "Navigation / controls"],
  ["registration", "Account / access"],
  ["jobs", "Job creation / search"],
  ["bids", "Bids / acceptance"],
  ["lifecycle", "Pickup / delivery workflow"],
  ["accessibility", "Text, contrast, keyboard or assistive technology"],
  ["performance", "Slowness / crash"],
  ["other", "Other"],
];

export default function PilotFeedbackPage() {
  const [diagnostics, setDiagnostics] = useState<PilotDiagnostics | null>(null);
  const [category, setCategory] = useState("layout");
  const [severity, setSeverity] = useState("minor");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [consent, setConsent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [reference, setReference] = useState("");

  useEffect(() => {
    try {
      const saved = sessionStorage.getItem(PILOT_DIAGNOSTICS_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as PilotDiagnostics;
        setDiagnostics(parsed);
        return;
      }
    } catch {
      // Re-capture below if the WebView blocked session storage or held invalid data.
    }
    try { setDiagnostics(collectPilotDiagnostics()); } catch { setDiagnostics(null); }
  }, []);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setReference("");
    if (!consent) {
      setError("Please confirm that you agree to send this feedback with the displayed technical diagnostics.");
      return;
    }
    setBusy(true);
    try {
      const response = await fetch("/api/pilot/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ category, severity, title, description, consent, diagnostics }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "The feedback could not be submitted.");
      setReference(data.referenceId || "received");
      try { sessionStorage.removeItem(PILOT_DIAGNOSTICS_STORAGE_KEY); } catch { /* optional cleanup */ }
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : "Network error. Copy your notes and retry.");
    } finally {
      setBusy(false);
    }
  }

  const fieldStyle: React.CSSProperties = {
    width: "100%", boxSizing: "border-box", padding: 11, marginTop: 6,
    border: "1px solid var(--color-border)", borderRadius: 8,
    background: "var(--color-surface)", color: "var(--color-text)",
  };
  const viewportLabel = diagnostics
    ? `${diagnostics.viewportWidth}×${diagnostics.viewportHeight} CSS px · screen ${diagnostics.screenWidth}×${diagnostics.screenHeight} · DPR ${diagnostics.devicePixelRatio} · horizontal overflow ${diagnostics.horizontalOverflowPx}px`
    : "Screen diagnostics unavailable in this WebView";

  return (
    <main style={{ width: "100%", maxWidth: 760, boxSizing: "border-box", margin: "0 auto", padding: "24px 16px 100px" }}>
      <p><Link href="/jobs" className="button-link button-link-secondary">← Back to marketplace</Link></p>
      <h1>UK-market QA feedback</h1>
      <p>Report what happened on the screen you were using. When you opened this form with the floating Report issue button, layout and device information was captured from that previous screen. This report helps validate the GB/GBP app configuration; it does not establish UK geolocation or local network behaviour.</p>
      {reference ? (
        <section role="status" style={{ border: "1px solid var(--color-border)", borderRadius: 12, padding: 18 }}>
          <h2>Feedback received</h2>
          <p>Reference: <strong>{reference}</strong></p>
          <p>Thank you. You can return to the marketplace or report another issue.</p>
          <p><Link href="/jobs">Return to marketplace</Link></p>
          <button type="button" onClick={() => { setReference(""); setTitle(""); setDescription(""); setConsent(false); setDiagnostics(collectPilotDiagnostics()); }}>Report another issue</button>
        </section>
      ) : (
        <form onSubmit={submit} style={{ display: "grid", gap: 16 }}>
          <label>Area
            <select style={fieldStyle} value={category} onChange={e => setCategory(e.target.value)}>
              {categories.map(([value, label]) => <option key={value} value={value}>{label}</option>)}
            </select>
          </label>
          <label>Impact
            <select style={fieldStyle} value={severity} onChange={e => setSeverity(e.target.value)}>
              <option value="blocker">Blocker — cannot continue</option>
              <option value="major">Major — core task broken</option>
              <option value="minor">Minor — workaround exists</option>
              <option value="suggestion">Suggestion / improvement</option>
            </select>
          </label>
          <label>Short title
            <input style={fieldStyle} required minLength={3} maxLength={120} value={title} onChange={e => setTitle(e.target.value)} placeholder="e.g. Accept bid button clipped on small screen" />
          </label>
          <label>What did you expect, and what happened?
            <textarea style={{ ...fieldStyle, minHeight: 130, resize: "vertical" }} required minLength={10} maxLength={3000} value={description} onChange={e => setDescription(e.target.value)} placeholder="Include the steps to reproduce and what you expected to happen." />
          </label>
          <section style={{ border: "1px solid var(--color-border)", borderRadius: 10, padding: 12 }}>
            <h2 style={{ marginTop: 0, fontSize: 17 }}>Screen diagnostics</h2>
            <p style={{ overflowWrap: "anywhere" }}>{viewportLabel}</p>
            {diagnostics && diagnostics.horizontalOverflowPx > 0
              ? <p role="alert">A horizontal overflow of {diagnostics.horizontalOverflowPx}px was detected on the captured screen. Please mention what was clipped.</p>
              : null}
            <details>
              <summary>View diagnostic details before sending</summary>
              <pre style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere", fontSize: 12 }}>{JSON.stringify(diagnostics, null, 2)}</pre>
            </details>
          </section>
          <label style={{ display: "flex", alignItems: "flex-start", gap: 10 }}>
            <input type="checkbox" required checked={consent} onChange={e => setConsent(e.target.checked)} style={{ marginTop: 4 }} />
            <span>I agree to send this report and the technical diagnostics shown above to the Post2Drive pilot team. The report is linked to my tester account so the team can investigate.</span>
          </label>
          <p style={{ color: "var(--color-muted)", fontSize: 13 }}>Do not include passwords, personal identity numbers, real identity/vehicle documents, payment details, private addresses or another person's personal information. This form does not upload screenshots. For a visual defect, take a screenshot and send it separately to the pilot organiser through the agreed private channel after checking it contains no sensitive information.</p>
          {error && <p role="alert">{error}</p>}
          <button type="submit" disabled={busy || !diagnostics}>{busy ? "Sending…" : "Submit feedback"}</button>
        </form>
      )}
    </main>
  );
}
