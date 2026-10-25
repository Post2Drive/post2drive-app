"use client";

import { useCallback, useEffect, useState } from "react";
import { signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { formatMarketDate, getLocalisationProfile } from "@/lib/localisation";


export default function SettingsPage() {
  const router = useRouter();
  const [account, setAccount] = useState<any>(null);
  const [form, setForm] = useState({
    name: "",
    phone: "",
    companyName: "",
    companyNumber: "",
    isSoleTrader: false,
    country: "GB",
    currency: "GBP",
    marketingConsent: false,
  });
  const [pwForm, setPwForm] = useState({ currentPassword: "", newPassword: "" });
  const [message, setMessage] = useState("");
  const [saveError, setSaveError] = useState("");
  const [pwMessage, setPwMessage] = useState("");
  const [pwError, setPwError] = useState("");
  const [loadingAccount, setLoadingAccount] = useState(true);
  const [loadError, setLoadError] = useState("");
  const [saveBusy, setSaveBusy] = useState(false);
  const [passwordBusy, setPasswordBusy] = useState(false);
  const [companyBusy, setCompanyBusy] = useState(false);
  const [companyMessage, setCompanyMessage] = useState("");
  const [companyError, setCompanyError] = useState("");
  const [deleteForm, setDeleteForm] = useState({ currentPassword: "", confirm: "" });
  const [deleteMessage, setDeleteMessage] = useState("");
  const [deleteBusy, setDeleteBusy] = useState(false);

  const loadAccount = useCallback(async () => {
    setLoadingAccount(true);
    setLoadError("");
    try {
      const response = await fetch("/api/account", { cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok || !data.account) {
        throw new Error(data.error || "Could not load account settings. Try again.");
      }
      setAccount(data.account);
      const user = data.account.users?.[0];
      setForm({
        name: user?.name || "",
        phone: user?.phone || "",
        companyName: data.account.companyName || "",
        companyNumber: data.account.companyNumber || "",
        isSoleTrader: data.account.isSoleTrader || false,
        country: data.account.country,
        currency: data.account.currency,
        marketingConsent: data.account.marketingConsent,
      });
    } catch (error) {
      setLoadError(error instanceof Error ? error.message : "Could not load account settings. Try again.");
    } finally {
      setLoadingAccount(false);
    }
  }, []);

  useEffect(() => {
    void loadAccount();
  }, [loadAccount]);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    if (saveBusy) return;
    setMessage("");
    setSaveError("");
    setSaveBusy(true);
    try {
      const response = await fetch("/api/account", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: form.name, phone: form.phone, companyName: form.companyName, marketingConsent: form.marketingConsent }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setSaveError(data.error || "Could not save account settings. Try again.");
        return;
      }
      setMessage("Saved.");
    } catch {
      setSaveError("Network error. Your settings could not be saved.");
    } finally {
      setSaveBusy(false);
    }
  }

  async function handlePasswordChange(e: React.FormEvent) {
    e.preventDefault();
    if (passwordBusy) return;
    setPwMessage("");
    setPwError("");
    setPasswordBusy(true);
    try {
      const response = await fetch("/api/account", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(pwForm),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setPwError(data.error || "Could not update password. Try again.");
        return;
      }
      setPwMessage("Password updated. Signing out all sessions…");
      setPwForm({ currentPassword: "", newPassword: "" });
      await signOut({ callbackUrl: "/login?passwordChanged=1" });
    } catch {
      setPwError("Network error. Check your connection and try again.");
    } finally {
      setPasswordBusy(false);
    }
  }

  if (loadingAccount) return <main style={{ maxWidth: 500, padding: 24 }}><p role="status" aria-live="polite">Loading account settings…</p></main>;
  if (loadError || !account) return <main style={{ maxWidth: 500, padding: 24 }}><h1>Account settings</h1><p role="alert">{loadError || "Account settings are unavailable."}</p><button type="button" onClick={() => void loadAccount()}>Try again</button></main>;

  const marketProfile = getLocalisationProfile({ country: account.country, currency: account.currency });

  return (
    <main className="account-settings-page" style={{ width: "100%", maxWidth: 760, margin: "0 auto", padding: "24px 16px 48px", boxSizing: "border-box" }}>
      <p>
        <Link href="/jobs" className="button-link button-link-secondary">← Back to jobs</Link>
      </p>
      <h1>Account settings</h1>
      <p style={{ color: "var(--color-muted)" }}>{account.displayId}</p>

      <h2>Profile</h2>
      <form onSubmit={handleSave} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <label>
          Your name
          <input type="text" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
        </label>
        <label>
          Phone
          <input type="tel" value={form.phone} onChange={(e) => setForm({ ...form, phone: e.target.value })} />
        </label>
        <label>
          Company name
          <input
            type="text"
            value={form.companyName}
            onChange={(e) => setForm({ ...form, companyName: e.target.value })}
          />
        </label>
        <div style={{ border: "1px solid var(--color-border)", borderRadius: 10, background: "var(--color-primary-soft)", padding: 13 }}>
          <strong>Marketplace</strong>
          <p style={{ margin: "6px 0 0" }}>{marketProfile ? `${marketProfile.marketplaceLabel} · ${marketProfile.currency} · ${marketProfile.timeZone}` : "Market configuration unavailable"}</p>
          <small>Country and currency are fixed at signup so your public job marketplace remains separate from the other market.</small>
        </div>
        <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <input
            type="checkbox"
            checked={form.marketingConsent}
            onChange={(e) => setForm({ ...form, marketingConsent: e.target.checked })}
          />
          I'd like to hear about other offers and updates
        </label>
        {saveError && <p role="alert">{saveError}</p>}
        {message && <p role="status" aria-live="polite">{message}</p>}
        <button type="submit" disabled={saveBusy}>{saveBusy ? "Saving…" : "Save"}</button>
      </form>

      <section aria-labelledby="company-verification-heading" style={{ marginTop: 32, padding: 18, border: "1px solid var(--color-border)", borderRadius: 12 }}>
        <h2 id="company-verification-heading" style={{ marginTop: 0 }}>Company verification</h2>
        <p>All job posters and carriers must have an approved business profile. Sole traders and one-vehicle operators can apply; company size does not change the requirement.</p>
        <p role="status" aria-live="polite">Status: <strong>{(account.companyVerificationStatus || "not_started").replaceAll("_", " ")}</strong></p>
        {account.companyVerificationSubmittedAt && <p>Submitted: {formatMarketDate(account.companyVerificationSubmittedAt, { country: account.country, currency: account.currency })}</p>}
        {account.companyVerifiedAt && <p>Verified: {formatMarketDate(account.companyVerifiedAt, { country: account.country, currency: account.currency })}</p>}
        <form onSubmit={async (event) => {
          event.preventDefault();
          if (companyBusy) return;
          setCompanyMessage(""); setCompanyError(""); setCompanyBusy(true);
          try {
            const response = await fetch("/api/company-verification", {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ companyName: form.companyName, companyNumber: form.companyNumber, isSoleTrader: form.isSoleTrader }),
            });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) { setCompanyError(data.error || "Could not submit company verification."); return; }
            setAccount((current: any) => ({ ...current, ...data.companyVerification }));
            setCompanyMessage(data.message || "Business details submitted for review.");
          } catch {
            setCompanyError("Network error. Company details were not submitted.");
          } finally {
            setCompanyBusy(false);
          }
        }} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <label>
            Legal business or trading name
            <input required minLength={2} maxLength={160} value={form.companyName} onChange={(event) => setForm({ ...form, companyName: event.target.value })} />
          </label>
          <label style={{ display: "flex", alignItems: "center", gap: 8 }}>
            <input type="checkbox" checked={form.isSoleTrader} onChange={(event) => setForm({ ...form, isSoleTrader: event.target.checked })} />
            I operate as a sole trader / individual operator
          </label>
          {!form.isSoleTrader && <label>
            Company or business registration number
            <input required minLength={2} maxLength={80} value={form.companyNumber} onChange={(event) => setForm({ ...form, companyNumber: event.target.value })} />
          </label>}
          <p style={{ color: "var(--color-muted)", margin: 0 }}>Submission starts a review; it does not automatically verify your business. A reviewer must confirm the details against appropriate records and evidence.</p>
          {companyError && <p role="alert">{companyError}</p>}
          {companyMessage && <p role="status" aria-live="polite">{companyMessage}</p>}
          <button type="submit" disabled={companyBusy || account.companyVerificationStatus === "pending"}>{companyBusy ? "Submitting…" : account.companyVerificationStatus === "pending" ? "Awaiting review" : "Submit for verification"}</button>
        </form>
      </section>

      <h2 style={{ marginTop: 32 }}>Change password</h2>
      <form onSubmit={handlePasswordChange} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <label>
          Current password
          <input
            type="password"
            required
            autoComplete="current-password"
            value={pwForm.currentPassword}
            onChange={(e) => setPwForm({ ...pwForm, currentPassword: e.target.value })}
          />
        </label>
        <label>
          New password
          <input
            type="password"
            required
            minLength={8}
            autoComplete="new-password"
            value={pwForm.newPassword}
            onChange={(e) => setPwForm({ ...pwForm, newPassword: e.target.value })}
          />
        </label>
        {pwError && <p role="alert">{pwError}</p>}
        {pwMessage && <p role="status" aria-live="polite">{pwMessage}</p>}
        <button type="submit" disabled={passwordBusy}>{passwordBusy ? "Updating…" : "Change password"}</button>
      </form>

      <h2 style={{ marginTop: 32 }}>Subscription</h2>
      <p style={{ color: "var(--color-muted)" }}>
        {account.country === "IN" ? "Access and pricing follow the policy configured for your market. Payment processing is not yet enabled in this rebuild." : `Access for ${marketProfile?.marketplaceLabel ?? "your market"} is currently configured in 7-day periods after any applicable promotional period. Payment processing is not yet enabled in this rebuild.`}
      </p>

      <section aria-labelledby="delete-account-heading" style={{ marginTop: 36, padding: 18, border: "1px solid var(--color-danger)", borderRadius: 12, background: "var(--color-danger-soft)" }}>
        <h3 id="delete-account-heading" style={{ marginTop: 0, color: "var(--color-danger)" }}>Delete account</h3>
        <p>You'll be signed out and your personal account details will be anonymised. Limited job, incident, payment and audit records may remain to protect other users and meet legal obligations. This cannot be undone through the app.</p>
        <form onSubmit={async (event) => {
          event.preventDefault(); setDeleteMessage(""); setDeleteBusy(true);
          try {
            const response = await fetch("/api/account", { method: "DELETE", headers: { "Content-Type": "application/json" }, body: JSON.stringify(deleteForm) });
            const data = await response.json().catch(() => ({}));
            if (!response.ok) { setDeleteMessage(data.error || "Could not delete account."); return; }
            await signOut({ redirect: false });
            router.push("/");
          } catch { setDeleteMessage("Network error. Please try again."); }
          finally { setDeleteBusy(false); }
        }} style={{ display: "grid", gap: 10 }}>
          <label>Current password<input type="password" required autoComplete="current-password" value={deleteForm.currentPassword} onChange={(e) => setDeleteForm({ ...deleteForm, currentPassword: e.target.value })} /></label>
          <label>Type DELETE to confirm<input required autoComplete="off" autoCapitalize="characters" spellCheck={false} value={deleteForm.confirm} onChange={(e) => setDeleteForm({ ...deleteForm, confirm: e.target.value })} /></label>
          {deleteMessage && <p role="alert">{deleteMessage}</p>}
          <button type="submit" disabled={deleteBusy || deleteForm.confirm !== "DELETE"} style={{ background: "var(--color-danger)", borderColor: "var(--color-danger)" }}>{deleteBusy ? "Deleting…" : "Permanently anonymise account"}</button>
        </form>
      </section>
    </main>
  );
}