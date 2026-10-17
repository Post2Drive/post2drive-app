"use client";

import { useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [resendMessage, setResendMessage] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");
    setResendMessage("");

    const res = await signIn("credentials", {
      email,
      password,
      redirect: false,
    });

    setLoading(false);

    if (res?.error) {
      setError("Invalid email or password. If you recently signed up, you may need to verify your email.");
      return;
    }

    router.push("/dashboard");
  }

  async function resendVerification() {
    setResending(true);
    setResendMessage("");
    try {
      const response = await fetch("/api/email/verification/resend", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = await response.json();
      setResendMessage(data.message || (response.ok ? "Check your inbox for a verification email." : "Could not request a verification email."));
    } catch {
      setResendMessage("Could not request a verification email. Please try again.");
    } finally {
      setResending(false);
    }
  }

  return (
    <div className="auth-page">
      <div>
      <h1>Log in</h1>
      <p>Sign in to post transport jobs, find delivery work and manage your activity in your selected market.</p>
      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <label>
          Email
          <input type="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label>
          Password
          <input
            type="password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        {error && <p role="alert" style={{ color: "red" }}>{error}</p>}
        {error && <div>
          <button type="button" onClick={() => void resendVerification()} disabled={resending || !email.trim()}>
            {resending ? "Requesting…" : "Resend verification email"}
          </button>
          {resendMessage && <p role="status">{resendMessage}</p>}
        </div>}
        <button className="auth-submit-button" type="submit" disabled={loading}>
          {loading ? "Logging in..." : "Log in"}
        </button>
      </form>
      <p style={{ marginTop: 18 }}><a href="/signup">Create an account</a> · <a href="/admin-access">Admin dashboard</a></p>
      </div>
    </div>
  );
}
