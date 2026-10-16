"use client";

import { useState } from "react";
import Link from "next/link";

export default function VerifyEmailForm({ token }: { token: string }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [verified, setVerified] = useState(false);

  async function verify() {
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/email/verify", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not verify this email.");
      setVerified(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Could not verify this email. Request a new link and try again.");
    } finally {
      setBusy(false);
    }
  }

  if (verified) {
    return (
      <div role="status" style={{ padding: 16, border: "1px solid var(--color-border)", borderRadius: 10 }}>
        <h2 style={{ marginTop: 0 }}>Email verified</h2>
        <p>Your email address is verified. You can now sign in to Post2Drive.</p>
        <Link className="button-link" href="/login">Continue to login</Link>
      </div>
    );
  }

  return (
    <div>
      <p>This one-time link expires 24 hours after it was sent.</p>
      {error && <p role="alert" style={{ color: "var(--color-danger, #b91c1c)" }}>{error}</p>}
      <button type="button" onClick={() => void verify()} disabled={busy}>
        {busy ? "Verifying…" : "Confirm email address"}
      </button>
    </div>
  );
}
