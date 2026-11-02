"use client";

import { useEffect, useRef, useState } from "react";

type Props = {
  /** "login" signs in with the code; "reset" also asks for a new password. */
  mode: "login" | "reset";
  /** Called with the confirmed details; return an error message to show, or null on success. */
  onConfirm: (details: { phone: string; code: string; password?: string }) => Promise<string | null>;
  submitLabel: string;
};

/** India: send a six-digit code to an account's mobile number, then confirm it. */
export default function PhoneCodeFlow({ mode, onConfirm, submitLabel }: Props) {
  const [phone, setPhone] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [stage, setStage] = useState<"phone" | "code">("phone");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [status, setStatus] = useState("");
  const [testMode, setTestMode] = useState(false);
  const [cooldown, setCooldown] = useState(0);
  const codeInput = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (cooldown <= 0) return;
    const timer = setTimeout(() => setCooldown((value) => value - 1), 1000);
    return () => clearTimeout(timer);
  }, [cooldown]);

  async function sendCode(event?: React.FormEvent) {
    event?.preventDefault();
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/phone-otp/request", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ phone }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data.error || "The code couldn't be sent. Please try again.");
        return;
      }
      setTestMode(Boolean(data.testMode));
      setStatus(`If ${data.to ?? "this number"} is registered, a code is on its way. It expires in 5 minutes.`);
      setStage("code");
      setCooldown(60);
      requestAnimationFrame(() => codeInput.current?.focus());
    } finally {
      setBusy(false);
    }
  }

  async function confirm(event: React.FormEvent) {
    event.preventDefault();
    setBusy(true);
    setError("");
    try {
      const message = await onConfirm({ phone, code, ...(mode === "reset" ? { password } : {}) });
      if (message) setError(message);
    } finally {
      setBusy(false);
    }
  }

  if (stage === "phone") {
    return (
      <form onSubmit={sendCode} className="phone-code-flow">
        <label>
          Mobile number (India)
          <input type="tel" inputMode="tel" autoComplete="tel" required value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="98765 43210" />
        </label>
        {error && <p role="alert">{error}</p>}
        <button type="submit" className="auth-submit-button" disabled={busy || !phone.trim()}>
          {busy ? "Sending…" : "Send code"}
        </button>
      </form>
    );
  }

  return (
    <form onSubmit={confirm} className="phone-code-flow">
      <p role="status" aria-live="polite">{status}</p>
      {testMode && <p className="phone-verify-test">Test mode: no text message is sent. An administrator can read the code in the SMS test outbox.</p>}
      <label>
        Six-digit code
        <input
          ref={codeInput}
          type="text"
          inputMode="numeric"
          autoComplete="one-time-code"
          pattern="[0-9]{6}"
          maxLength={6}
          required
          value={code}
          onChange={(e) => setCode(e.target.value.replace(/\D/g, ""))}
        />
      </label>
      {mode === "reset" && (
        <label>
          New password
          <input type="password" autoComplete="new-password" required minLength={8} value={password} onChange={(e) => setPassword(e.target.value)} />
        </label>
      )}
      {error && <p role="alert">{error}</p>}
      <button type="submit" className="auth-submit-button" disabled={busy || code.length !== 6 || (mode === "reset" && password.length < 8)}>
        {busy ? "Checking…" : submitLabel}
      </button>
      <div className="phone-code-actions">
        <button type="button" className="button-link-secondary" onClick={() => void sendCode()} disabled={busy || cooldown > 0}>
          {cooldown > 0 ? `Send a new code (${cooldown}s)` : "Send a new code"}
        </button>
        <button type="button" className="button-link-secondary" onClick={() => { setStage("phone"); setCode(""); setError(""); }}>
          Change number
        </button>
      </div>
    </form>
  );
}
