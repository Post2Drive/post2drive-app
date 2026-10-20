"use client";

import { useState } from "react";

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setLoading(true);
    setMessage("");
    setError("");
    try {
      const response = await fetch("/api/auth/forgot-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data.message || "Could not request a reset link. Please try again.");
        return;
      }
      setMessage(data.message || "If an account exists for that email, a reset link will be sent shortly.");
    } catch {
      setError("Network error. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  return <main className="auth-page"><section className="auth-shell">
    <h1>Forgot your password?</h1>
    <p>Enter the email address associated with your Post2Drive account. If it exists, we’ll send a secure reset link.</p>
    <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
      <label>Email
        <input type="email" required maxLength={254} autoComplete="email" value={email} onChange={(event) => setEmail(event.target.value)} />
      </label>
      {error && <p role="alert" style={{ color: "var(--color-danger)" }}>{error}</p>}
      {message && <p role="status">{message}</p>}
      <button className="auth-submit-button" type="submit" disabled={loading}>
        {loading ? "Sending…" : "Send reset link"}
      </button>
    </form>
    <p style={{ marginTop: 18 }}><a href="/login">Back to log in</a></p>
  </section></main>;
}
