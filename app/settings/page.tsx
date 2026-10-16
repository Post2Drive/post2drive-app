"use client";

import { useEffect, useState } from "react";
import { signOut } from "next-auth/react";
import { useRouter } from "next/navigation";
import Link from "next/link";


export default function SettingsPage() {
  const router = useRouter();
  const [account, setAccount] = useState<any>(null);
  const [form, setForm] = useState({
    name: "",
    phone: "",
    companyName: "",
    country: "GB",
    currency: "GBP",
    marketingConsent: false,
  });
  const [pwForm, setPwForm] = useState({ currentPassword: "", newPassword: "" });
  const [message, setMessage] = useState("");
  const [pwMessage, setPwMessage] = useState("");
  const [deleteForm, setDeleteForm] = useState({ currentPassword: "", confirm: "" });
  const [deleteMessage, setDeleteMessage] = useState("");
  const [deleteBusy, setDeleteBusy] = useState(false);

  useEffect(() => {
    fetch("/api/account")
      .then((res) => res.json())
      .then((data) => {
        if (data.account) {
          setAccount(data.account);
          const user = data.account.users?.[0];
          setForm({
            name: user?.name || "",
            phone: user?.phone || "",
            companyName: data.account.companyName,
            country: data.account.country,
            currency: data.account.currency,
            marketingConsent: data.account.marketingConsent,
          });
        }
      });
  }, []);

  async function handleSave(e: React.FormEvent) {
    e.preventDefault();
    setMessage("");
    const res = await fetch("/api/account", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: form.name, phone: form.phone, companyName: form.companyName, marketingConsent: form.marketingConsent }),
    });
    const data = await res.json();
    setMessage(res.ok ? "Saved." : data.error || "Something went wrong.");
  }

  async function handlePasswordChange(e: React.FormEvent) {
    e.preventDefault();
    setPwMessage("");
    const res = await fetch("/api/account", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(pwForm),
    });
    const data = await res.json();
    if (!res.ok) {
      setPwMessage(data.error || "Something went wrong.");
      return;
    }
    setPwMessage("Password updated.");
    setPwForm({ currentPassword: "", newPassword: "" });
  }

  if (!account) return <p>Loading...</p>;

  return (
    <div style={{ maxWidth: 500 }}>
      <p>
        <Link href="/jobs" className="button-link button-link-secondary">← Back to jobs</Link>
      </p>
      <h1>Account settings</h1>
      <p style={{ color: "var(--color-muted)" }}>{account.displayId}</p>

      <h3>Profile</h3>
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
          <p style={{ margin: "6px 0 0" }}>{account.country === "IN" ? "India · INR · Asia/Kolkata" : "United Kingdom · GBP · Europe/London"}</p>
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
        {message && <p>{message}</p>}
        <button type="submit">Save</button>
      </form>

      <h3 style={{ marginTop: 32 }}>Change password</h3>
      <form onSubmit={handlePasswordChange} style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        <label>
          Current password
          <input
            type="password"
            value={pwForm.currentPassword}
            onChange={(e) => setPwForm({ ...pwForm, currentPassword: e.target.value })}
          />
        </label>
        <label>
          New password
          <input
            type="password"
            minLength={8}
            value={pwForm.newPassword}
            onChange={(e) => setPwForm({ ...pwForm, newPassword: e.target.value })}
          />
        </label>
        {pwMessage && <p>{pwMessage}</p>}
        <button type="submit">Change password</button>
      </form>

      <h3 style={{ marginTop: 32 }}>Subscription</h3>
      <p style={{ color: "var(--color-muted)" }}>
        UK paid access is offered in 7-day periods after the promotional period ends. Payment processing is not yet enabled in this rebuild.
      </p>

      <section style={{ marginTop: 36, padding: 18, border: "1px solid #E2B9B9", borderRadius: 12, background: "#FFF8F8" }}>
        <h3 style={{ marginTop: 0, color: "var(--color-danger)" }}>Delete account</h3>
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
          <label>Type DELETE to confirm<input required value={deleteForm.confirm} onChange={(e) => setDeleteForm({ ...deleteForm, confirm: e.target.value })} /></label>
          {deleteMessage && <p role="alert">{deleteMessage}</p>}
          <button type="submit" disabled={deleteBusy || deleteForm.confirm !== "DELETE"} style={{ background: "var(--color-danger)", borderColor: "var(--color-danger)" }}>{deleteBusy ? "Deleting…" : "Permanently anonymise account"}</button>
        </form>
      </section>
    </div>
  );
}