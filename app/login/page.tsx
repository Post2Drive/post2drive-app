"use client";

import { useEffect, useState } from "react";
import { signIn } from "next-auth/react";
import { useRouter } from "next/navigation";
import PhoneCodeFlow from "@/components/phone-code-flow";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [notice, setNotice] = useState("");
  const [loading, setLoading] = useState(false);
  const [resending, setResending] = useState(false);
  const [resendMessage, setResendMessage] = useState("");
  const [method, setMethod] = useState<"password" | "phone-code" | "email-code">("password");
  const [codeEmail, setCodeEmail] = useState("");
  const [emailCode, setEmailCode] = useState("");
  const [codeSent, setCodeSent] = useState(false);
  const [codeBusy, setCodeBusy] = useState(false);
  const [codeMessage, setCodeMessage] = useState("");

  useEffect(() => {
    if (new URLSearchParams(window.location.search).get("passwordChanged") === "1") {
      setNotice("Password updated. Please sign in again with your new password.");
    }
  }, []);

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
      setError("Invalid email/phone or password. If you recently signed up outside India, you may need to verify your email.");
      return;
    }

    router.push("/dashboard");
  }

  async function sendEmailCode() {
    setCodeBusy(true);
    setCodeMessage("");
    try {
      const response = await fetch("/api/email-code/request", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: codeEmail }),
      });
      const data = await response.json().catch(() => ({}));
      if (response.ok) {
        setCodeSent(true);
        setCodeMessage("If that email is registered, a six-digit code is on its way. It expires in 5 minutes.");
      } else {
        setCodeMessage(typeof data.error === "string" ? data.error : "Could not send a code. Please try again.");
      }
    } catch {
      setCodeMessage("Could not send a code. Please try again.");
    } finally {
      setCodeBusy(false);
    }
  }

  async function confirmEmailCode(e: React.FormEvent) {
    e.preventDefault();
    setCodeBusy(true);
    setCodeMessage("");
    const res = await signIn("email-code", { email: codeEmail, code: emailCode, redirect: false });
    setCodeBusy(false);
    if (res?.error) {
      setCodeMessage("That code is wrong or has expired. Check it, or send a new one.");
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
    <main className="auth-page">
      <section className="login-shell">
      <h1>Log in</h1>
      <p>Sign in to post transport jobs, find delivery work and manage your activity in your selected market.</p>
      {notice && <p role="status" aria-live="polite">{notice}</p>}
      {method === "email-code" ? (
        <>
          <form onSubmit={codeSent ? confirmEmailCode : (e) => { e.preventDefault(); void sendEmailCode(); }} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
            <label>
              Email
              <input type="email" autoComplete="email" required maxLength={254} value={codeEmail} onChange={(e) => setCodeEmail(e.target.value)} disabled={codeSent} />
            </label>
            {codeSent && <label>
              Six-digit code
              <input inputMode="numeric" autoComplete="one-time-code" pattern="[0-9]{6}" maxLength={6} required value={emailCode} onChange={(e) => setEmailCode(e.target.value.replace(/\D/g, ""))} />
            </label>}
            {codeMessage && <p role="status" aria-live="polite">{codeMessage}</p>}
            <button className="auth-submit-button" type="submit" disabled={codeBusy}>
              {codeBusy ? "Please wait…" : codeSent ? "Log in" : "Email me a code"}
            </button>
            {codeSent && <button type="button" className="button-link-secondary" disabled={codeBusy} onClick={() => void sendEmailCode()}>Send a new code</button>}
          </form>
          <p style={{ marginTop: 18 }}><button type="button" className="button-link-secondary" onClick={() => setMethod("password")}>Use email or phone and password</button></p>
        </>
      ) : method === "phone-code" ? (
        <>
          <PhoneCodeFlow
            mode="login"
            submitLabel="Log in"
            onConfirm={async ({ phone, code }) => {
              const res = await signIn("phone-otp", { phone, code, redirect: false });
              if (res?.error) return "That code is wrong or has expired. Check it, or send a new one.";
              router.push("/dashboard");
              return null;
            }}
          />
          <p style={{ marginTop: 18 }}><button type="button" className="button-link-secondary" onClick={() => setMethod("password")}>Use email or phone and password</button></p>
        </>
      ) : (
      <>
      <form onSubmit={handleSubmit} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <label>
          Email or phone number (India accounts)
          <input type="text" autoComplete="email" required value={email} onChange={(e) => setEmail(e.target.value)} />
        </label>
        <label>
          Password
          <input
            type="password"
            autoComplete="current-password"
            required
            value={password}
            onChange={(e) => setPassword(e.target.value)}
          />
        </label>
        {error && <p role="alert" style={{ color: "var(--color-danger)" }}>{error}</p>}
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
      <p style={{ marginTop: 18 }}><button type="button" className="button-link-secondary" onClick={() => setMethod("email-code")}>Email me a sign-in code instead of using a password</button></p>
      <p style={{ marginTop: 8 }}><button type="button" className="button-link-secondary" onClick={() => setMethod("phone-code")}>India: use a text code instead of a password</button></p>
      </>
      )}
      <p style={{ marginTop: 18 }}><a href="/forgot-password">Forgot password?</a> · <a href="/signup">Create an account</a></p>
      </section>
    </main>
  );
}
