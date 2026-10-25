"use client";

import { useCallback, useEffect, useState } from "react";

type Application = {
  id: string;
  companyName: string;
  companyNumber: string | null;
  isSoleTrader: boolean;
  country: string;
  currency: string;
  companyVerificationStatus: string;
  companyVerificationSubmittedAt: string | null;
  verificationStatus: string;
  users: { name: string; email: string; phone: string }[];
};

export default function CompanyVerificationReviewPage() {
  const [applications, setApplications] = useState<Application[]>([]);
  const [error, setError] = useState("");
  const [message, setMessage] = useState("");
  const [busyId, setBusyId] = useState("");

  const load = useCallback(async () => {
    setError("");
    try {
      const response = await fetch("/api/admin/company-verification", { cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Could not load company verification queue.");
      setApplications(data.applications || []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not load company verification queue.");
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function decide(application: Application, decision: "verified" | "failed" | "manual_review") {
    setBusyId(application.id);
    setError("");
    setMessage("");
    try {
      const response = await fetch("/api/admin/company-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId: application.id, decision }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Could not save review decision.");
      setMessage(`${application.companyName}: ${decision.replaceAll("_", " ")}.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not save review decision.");
    } finally {
      setBusyId("");
    }
  }

  return (
    <main style={{ maxWidth: 1000, margin: "0 auto", padding: 24 }}>
      <h1>Company verification</h1>
      <p>Review business details against appropriate official records and evidence before approving. A submitted name or registration number is not proof on its own. Use manual review when identity, legal status, or sole-trader evidence is unclear.</p>
      {error && <p role="alert">{error}</p>}
      {message && <p role="status" aria-live="polite">{message}</p>}
      <button type="button" onClick={() => void load()}>Refresh queue</button>
      {applications.length === 0 ? <p>No company verification applications are awaiting review.</p> : (
        <div style={{ display: "grid", gap: 16, marginTop: 20 }}>
          {applications.map((application) => (
            <article key={application.id} style={{ border: "1px solid var(--color-border)", borderRadius: 12, padding: 16 }}>
              <h2 style={{ marginTop: 0 }}>{application.companyName}</h2>
              <p>Account: <code>{application.id}</code></p>
              <p>Market: {application.country} / {application.currency}</p>
              <p>Business type: {application.isSoleTrader ? "Sole trader / individual operator" : "Registered business"}</p>
              <p>Registration number: {application.companyNumber || "Not supplied"}</p>
              <p>Account verification: {application.verificationStatus}</p>
              <p>Company status: {application.companyVerificationStatus}</p>
              <p>Contact: {application.users?.[0]?.name || "—"} · {application.users?.[0]?.email || "—"} · {application.users?.[0]?.phone || "—"}</p>
              <p>Submitted: {application.companyVerificationSubmittedAt ? new Date(application.companyVerificationSubmittedAt).toLocaleString() : "—"}</p>
              <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                <button disabled={busyId === application.id} onClick={() => void decide(application, "verified")}>Approve</button>
                <button disabled={busyId === application.id} onClick={() => void decide(application, "manual_review")}>Needs manual review</button>
                <button disabled={busyId === application.id} onClick={() => void decide(application, "failed")}>Reject</button>
              </div>
            </article>
          ))}
        </div>
      )}
    </main>
  );
}
