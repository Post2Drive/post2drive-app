"use client";

import { useState } from "react";

export default function PilotCodeGenerator() {
  const [code, setCode] = useState("");
  const [expiresAt, setExpiresAt] = useState("");
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  async function generate() {
    if (code && !window.confirm("Generating a replacement code immediately invalidates the code already shown. Continue?")) return;
    setBusy(true);
    setMessage("");
    setCopied(false);
    try {
      const response = await fetch("/api/admin/testers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "generate-pilot-code" }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Could not generate the pilot code.");
      setCode(String(data.code || ""));
      setExpiresAt(String(data.expiresAt || ""));
      setMessage("Code generated. Copy it now; the plaintext is not saved and cannot be retrieved later.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not generate the pilot code.");
    } finally {
      setBusy(false);
    }
  }

  async function copyCode() {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
    } catch {
      setMessage("Copy was blocked by the browser. Select the code field and copy it manually.");
    }
  }

  return (
    <section style={{ border: "1px solid var(--color-border)", borderRadius: 12, padding: 16, margin: "16px 0" }}>
      <h2 style={{ marginTop: 0 }}>Shared UK student-pilot access</h2>
      <p>Generate one reusable code for the invited cohort. It expires after 14 days, works only in the allow-listed staging environment, and generating a replacement invalidates the previous code. The database stores only a hash.</p>
      <p><strong>Important bypasses:</strong> accounts using this code are marked as testers, receive staging promotional access, skip email verification, and can exercise posting/bidding without real identity, company or vehicle verification. This does not mark them genuinely verified and must not be used for production or real deliveries.</p>
      <button type="button" onClick={() => void generate()} disabled={busy}>{busy ? "Generating…" : code ? "Replace shared code" : "Generate shared code"}</button>
      {code && <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
        <label>Copy this code now
          <input readOnly value={code} onFocus={event => event.currentTarget.select()} style={{ display: "block", width: "100%", boxSizing: "border-box", padding: 10, marginTop: 6 }} />
        </label>
        <div><button type="button" onClick={() => void copyCode()}>Copy code</button> {copied ? <span role="status">Copied</span> : null}</div>
        <p>Expires: {expiresAt ? new Date(expiresAt).toLocaleString("en-GB", { timeZone: "Europe/London" }) + " UK time" : "not available"}</p>
      </div>}
      {message && <p role="status" aria-live="polite">{message}</p>}
    </section>
  );
}
