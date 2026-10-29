"use client";

import { useState } from "react";

export default function PilotCodeGenerator() {
  const [count, setCount] = useState("10");
  const [codes, setCodes] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);

  async function generate() {
    const requestedCount = Number(count);
    if (!Number.isInteger(requestedCount) || requestedCount < 1 || requestedCount > 100) {
      setMessage("Choose between 1 and 100 codes.");
      return;
    }
    setBusy(true);
    setMessage("");
    setCopied(false);
    setCodes([]);
    try {
      const response = await fetch("/api/admin/testers", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "generate-pilot-codes", count: requestedCount }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Could not generate QA codes.");
      const generated = Array.isArray(data.codes) ? data.codes.filter((value: unknown): value is string => typeof value === "string") : [];
      if (generated.length !== requestedCount) throw new Error("The server did not return the expected number of codes. Check the admin audit log before retrying.");
      setCodes(generated);
      setMessage("Codes generated. Copy and distribute one code per student. The plaintext is not stored and cannot be retrieved after this screen is closed.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Could not generate QA codes.");
    } finally {
      setBusy(false);
    }
  }

  async function copyCodes() {
    try {
      await navigator.clipboard.writeText(codes.join("\n"));
      setCopied(true);
      setMessage("All codes copied. Distribute each code privately to one student; every code works once.");
    } catch {
      setMessage("Copy was blocked by the browser. Select the code list and copy it manually.");
    }
  }

  const fieldStyle: React.CSSProperties = {
    boxSizing: "border-box",
    width: "100%",
    padding: 10,
    border: "1px solid var(--color-border)",
    borderRadius: 8,
    background: "var(--color-surface)",
    color: "var(--color-text)",
    font: "inherit",
  };

  return (
    <section style={{ border: "1px solid var(--color-border)", borderRadius: 12, padding: 16, margin: "16px 0" }}>
      <h2 style={{ marginTop: 0 }}>UK-market QA access codes</h2>
      <p>Generate one-time codes for invited student volunteers testing the GB/GBP version of Post2Drive. Volunteers may be in India; this validates the UK market configuration and app workflows, not physical UK location, network conditions or local compliance.</p>
      <label style={{ display: "grid", gap: 6, maxWidth: 220 }}>
        Number of students / codes (1–100)
        <input type="number" min={1} max={100} step={1} value={count} onChange={event => setCount(event.target.value)} style={fieldStyle} />
      </label>
      <p><strong>Tester-only allowances:</strong> in the allow-listed staging environment, these accounts skip manual tester approval and email verification and may exercise posting/bidding workflows without genuine identity, company or vehicle verification. Verification status is not falsified. Do not use these accounts for real deliveries, real customer data or payments.</p>
      <button type="button" onClick={() => void generate()} disabled={busy}>{busy ? "Generating…" : "Generate single-use codes"}</button>
      {codes.length > 0 && (
        <div style={{ display: "grid", gap: 8, marginTop: 12 }}>
          <label style={{ display: "grid", gap: 6 }}>
            Copy each code to one student
            <textarea readOnly value={codes.join("\n")} rows={Math.min(12, codes.length)} onFocus={event => event.currentTarget.select()} style={{ ...fieldStyle, fontFamily: "ui-monospace, SFMono-Regular, Consolas, monospace" }} />
          </label>
          <div><button type="button" onClick={() => void copyCodes()}>Copy all codes</button> {copied ? <span role="status">Copied</span> : null}</div>
          <p>{codes.length} single-use codes generated. Earlier codes remain valid until claimed; generating a new batch does not invalidate them.</p>
        </div>
      )}
      {message && <p role="status" aria-live="polite">{message}</p>}
    </section>
  );
}
