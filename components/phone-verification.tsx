"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  verified: boolean;
  /** Called after a successful verification so the parent can refresh. */
  onVerified?: () => void;
};

/**
 * Send a six-digit code to the saved number and confirm it. The number is
 * always the one saved in Account details; the server picks it, not the page.
 */
export default function PhoneVerification({ verified, onVerified }: Props) {
  const [stage, setStage] = useState<"idle" | "sent">("idle");
  const [code, setCode] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sentTo, setSentTo] = useState<string | null>(null);
  const [testMode, setTestMode] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const [done, setDone] = useState(verified);
  const codeInput = useRef<HTMLInputElement>(null);

  useEffect(() => setDone(verified), [verified]);
  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((value) => value - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  if (done) {
    return (
      <p className="phone-verify-status" role="status">
        <span aria-hidden="true">✓</span> Phone number verified
      </p>
    );
  }

  async function sendCode() {
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/account/phone/request", { method: "POST" });
      const data = await response.json().catch(() => ({}));
      if (data.verified) { setDone(true); onVerified?.(); return; }
      if (!response.ok) {
        setError(data.error || "The code couldn't be sent. Please try again.");
        if (data.retryAfterSeconds) setCooldown(Number(data.retryAfterSeconds));
        return;
      }
      setSentTo(data.to ?? null);
      setTestMode(Boolean(data.testMode));
      setStage("sent");
      setCooldown(60);
      requestAnimationFrame(() => codeInput.current?.focus());
    } finally {
      setBusy(false);
    }
  }

  async function verifyCode(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const response = await fetch("/api/account/phone/verify", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ code }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.verified) {
        setError(data.error || "That code didn't work. Please try again.");
        return;
      }
      setDone(true);
      onVerified?.();
    } finally {
      setBusy(false);
    }
  }

  return (
    <section className="phone-verify" aria-labelledby="phone-verify-title">
      <h2 id="phone-verify-title">Verify your phone</h2>
      {stage === "idle" ? (
        <>
          <p>We&apos;ll text a six-digit code to the number saved above. Save any changes to your number first.</p>
          <button type="button" onClick={() => void sendCode()} disabled={busy || cooldown > 0}>
            {busy ? "Sending…" : cooldown > 0 ? `Send code (${cooldown}s)` : "Send code"}
          </button>
        </>
      ) : (
        <form onSubmit={verifyCode} className="phone-verify-form">
          <p role="status" aria-live="polite">
            Code sent{sentTo ? ` to ${sentTo}` : ""}. It expires in 5 minutes.
          </p>
          {testMode && (
            <p className="phone-verify-test">
              Test mode: no text message is sent. An administrator can read the code in the SMS test outbox.
            </p>
          )}
          <label>
            Six-digit code
            <input
              ref={codeInput}
              type="text"
              inputMode="numeric"
              autoComplete="one-time-code"
              pattern="[0-9]{6}"
              maxLength={6}
              value={code}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, ""))}
              required
            />
          </label>
          <div className="phone-verify-actions">
            <button type="submit" disabled={busy || code.length !== 6}>{busy ? "Checking…" : "Verify"}</button>
            <button type="button" className="button-link-secondary" onClick={() => void sendCode()} disabled={busy || cooldown > 0}>
              {cooldown > 0 ? `Send a new code (${cooldown}s)` : "Send a new code"}
            </button>
          </div>
        </form>
      )}
      {error && <p role="alert">{error}</p>}
    </section>
  );
}
