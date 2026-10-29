"use client";

import { useEffect, useState } from "react";

const CODE_DISPLAY_MS = 15 * 60 * 1000;

export default function PilotCodeGenerator() {
  const [count, setCount] = useState("10");
  const [codes, setCodes] = useState<string[]>([]);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);
  const [copied, setCopied] = useState(false);
  const [showCodes, setShowCodes] = useState(false);

  useEffect(() => {
    if (!showCodes || codes.length === 0) return;
    const timeout = window.setTimeout(() => {
      setShowCodes(false);
      setCodes([]);
      setCopied(false);
      setMessage("For security, the displayed codes were cleared after 15 minutes. Any unclaimed codes remain valid until they expire; generate a new batch only if needed.");
    }, CODE_DISPLAY_MS);
    return () => window.clearTimeout(timeout);
  }, [showCodes, codes]);

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
    setShowCodes(false);
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
      setShowCodes(true);
      setMessage("Codes generated. Copy and distribute one code privately to each student. The codes are shown here for up to 15 minutes and are not saved as plaintext on the server.");
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
      setMessage("Copy was blocked by the browser. Focus the code list, select its contents and copy manually.");
    }
  }

  function closeCodeWindow() {
    setShowCodes(false);
    setCodes([]);
    setCopied(false);
    setMessage("The displayed plaintext codes were cleared from this page. They cannot be retrieved again; unclaimed codes remain valid until they expire.");
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

      {showCodes && codes.length > 0 && (
        <div role="presentation" onMouseDown={event => { if (event.target === event.currentTarget) closeCodeWindow(); }} style={{ position: "fixed", inset: 0, zIndex: 1000, background: "rgba(0,0,0,0.55)", display: "grid", placeItems: "center", padding: 16 }}>
          <section role="dialog" aria-modal="true" aria-labelledby="pilot-codes-title" style={{ width: "min(680px, 100%)", maxHeight: "85vh", overflow: "auto", background: "var(--color-surface, #fff)", color: "var(--color-text, #111)", border: "1px solid var(--color-border, #ddd)", borderRadius: 14, padding: 20, boxShadow: "0 20px 60px rgba(0,0,0,0.3)" }}>
            <h3 id="pilot-codes-title" style={{ marginTop: 0 }}>Your generated one-time codes</h3>
            <p>Copy these now and share each privately with one student. For security, this window closes and clears the codes after 15 minutes, or immediately when you close it. The server stores only code hashes, so the plaintext cannot be recovered later.</p>
            <label style={{ display: "grid", gap: 6 }}>
              Generated codes
              <textarea aria-label="Generated one-time codes" readOnly value={codes.join("\n")} rows={Math.min(12, codes.length)} onFocus={event => event.currentTarget.select()} style={{ ...fieldStyle, fontFamily: "ui-monospace, SFMono-Regular, Consolas, monospace", resize: "vertical" }} />
            </label>
            <p>{codes.length} single-use codes. Earlier codes remain valid until claimed or expired; generating a new batch does not invalidate them.</p>
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
              <button type="button" onClick={() => void copyCodes()}>{copied ? "Copy again" : "Copy all codes"}</button>
              <button type="button" onClick={closeCodeWindow}>Close and clear codes</button>
            </div>
            {copied && <p role="status">Copied to clipboard.</p>}
          </section>
        </div>
      )}
      {message && <p role="status" aria-live="polite">{message}</p>}
    </section>
  );
}
