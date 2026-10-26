"use client";

import { useEffect, useState } from "react";

export default function ResetPasswordPage() {
  const [token, setToken] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [completed, setCompleted] = useState(false);

  useEffect(() => {
    const url = new URL(window.location.href);
    const resetToken = url.searchParams.get("token") || "";
    setToken(resetToken);

    // The reset token is needed only in component state. Remove it from the
    // visible URL/history immediately to reduce accidental referrer/log leaks.
    if (url.searchParams.has("token")) {
      url.searchParams.delete("token");
      const cleanUrl = url.pathname + url.search + url.hash;
      window.history.replaceState(window.history.state, "", cleanUrl);
    }
  }, []);

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError("");
    setMessage("");
    if (password.length < 8) {
      setError("Your password must contain at least 8 characters.");
      return;
    }
    if (password !== confirmPassword) {
      setError("The passwords do not match.");
      return;
    }
    if (!token) {
      setError("This reset link is missing or invalid. Request a new one.");
      return;
    }

    setLoading(true);
    try {
      const response = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data.message || "This reset link is invalid or expired. Request a new one.");
        return;
      }
      setCompleted(true);
      setMessage(data.message || "Your password has been reset. Please log in.");
    } catch {
      setError("Network error. Check your connection and try again.");
    } finally {
      setLoading(false);
    }
  }

  return <main className="auth-page"><section className="auth-shell">
    <h1>Reset your password</h1>
    <p>Choose a new password for your Post2Drive account. Reset links expire after one hour and can only be used once.</p>
    {completed ? <><p role="status">{message}</p><p><a href="/login">Log in with your new password</a></p></> :
      <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <label>New password
          <input type="password" required minLength={8} maxLength={1024} autoComplete="new-password" value={password} onChange={(event) => setPassword(event.target.value)} />
        </label>
        <label>Confirm new password
          <input type="password" required minLength={8} maxLength={1024} autoComplete="new-password" value={confirmPassword} onChange={(event) => setConfirmPassword(event.target.value)} />
        </label>
        {error && <p role="alert" style={{ color: "var(--color-danger)" }}>{error}</p>}
        <button className="auth-submit-button" type="submit" disabled={loading || !token}>
          {loading ? "Resetting…" : "Reset password"}
        </button>
      </form>}
    {!completed && <p style={{ marginTop: 18 }}><a href="/forgot-password">Request a new reset link</a> · <a href="/login">Back to log in</a></p>}
  </section></main>;
}
