"use client";

import { FormEvent, useState } from "react";
import { useRouter } from "next/navigation";

export default function QaAdminAccessForm() {
  const router = useRouter();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/admin/qa-campaigns/access", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ username, password }),
        cache: "no-store",
      });
      const payload = await response.json();
      if (!response.ok) throw new Error(payload.error || "Could not verify Ops Dashboard access.");
      setPassword("");
      router.refresh();
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not verify Ops Dashboard access.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <section style={{ maxWidth: 520, marginTop: 24, border: "1px solid var(--color-border, #D7DCE4)", borderRadius: "var(--radius-lg, 14px)", padding: 22, background: "var(--color-surface, #FFFFFF)", boxShadow: "var(--shadow-card, 0 2px 8px rgba(23, 23, 23, 0.07))" }}>
      <h2 style={{ margin: "0 0 8px", fontSize: 20 }}>Verify Ops Dashboard access</h2>
      <p style={{ color: "var(--color-muted, #454B55)", lineHeight: 1.55, marginTop: 0 }}>
        Use the same username and password you use for the Ops Dashboard. Access is limited to this browser session for up to 8 hours. Your credentials are checked server-side and are not stored.
      </p>
      <form onSubmit={submit}>
        <label htmlFor="ops-admin-username" style={{ display: "block", fontSize: 13, fontWeight: 650, marginBottom: 6 }}>Ops Dashboard username</label>
        <input id="ops-admin-username" autoComplete="username" required maxLength={256} value={username} onChange={e => setUsername(e.target.value)} style={{ width: "100%", boxSizing: "border-box", padding: "10px 12px", border: "1px solid var(--color-border, #D7DCE4)", borderRadius: "var(--radius-sm, 6px)", marginBottom: 14 }} />
        <label htmlFor="ops-admin-password" style={{ display: "block", fontSize: 13, fontWeight: 650, marginBottom: 6 }}>Ops Dashboard password</label>
        <input id="ops-admin-password" type="password" autoComplete="current-password" required maxLength={1024} value={password} onChange={e => setPassword(e.target.value)} style={{ width: "100%", boxSizing: "border-box", padding: "10px 12px", border: "1px solid #cbd5e1", borderRadius: 8, marginBottom: 14 }} />
        {error ? <p role="alert" style={{ color: "var(--color-danger, #D62828)", margin: "0 0 12px" }}>{error}</p> : null}
        <button type="submit" disabled={busy} style={{ border: 0, borderRadius: "var(--radius-sm, 6px)", padding: "10px 14px", minHeight: 40, background: "var(--color-primary-action, #2457D6)", color: "#FFFFFF", fontWeight: 650, cursor: busy ? "wait" : "pointer" }}>
          {busy ? "Verifying…" : "Verify and open builder"}
        </button>
      </form>
    </section>
  );
}
