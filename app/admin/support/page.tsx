"use client";

import { FormEvent, useState } from "react";
import { vehicleTypeLabel } from "@/lib/vehicles";

type SupportAccount = {
  id: string; displayId: string; companyName: string; country: string; currency: string; planType: string;
  isSoleTrader: boolean; isTester: boolean; createdAt: string; deletionRequestedAt: string | null;
  verificationStatus: string; companyVerificationStatus: string; phoneVerifiedAt: string | null;
  users: { name: string; email: string | null; emailVerifiedAt: string | null; phone: string; role: string; personVerifiedAt: string | null }[];
  vehicles: { regPlate: string; vehicleType: string; verificationStatus: string; rejectionReason: string | null }[];
  notifications: { type: string; title: string; createdAt: string; readAt: string | null }[];
  recentJobs: { id: string; status: string; pickup: string; dropoff: string; createdAt: string; role: string }[];
};

const day = (value: string | null) => (value ? value.slice(0, 10) : "No");
const yes = (value: string | null) => (value ? `Yes (${day(value)})` : "No");

/*
 * Admin support lookup: view only. Read by an administrator when an account owner asks
 * support for help. Frequent-use screen, so no motion. Each search is recorded in the
 * admin audit log (search kind and match count only).
 */
export default function SupportLookupPage() {
  const [query, setQuery] = useState("");
  const [accounts, setAccounts] = useState<SupportAccount[] | null>(null);
  const [message, setMessage] = useState<{ text: string; error: boolean }>({ text: "", error: false });
  const [busy, setBusy] = useState(false);

  async function search(event: FormEvent) {
    event.preventDefault();
    setBusy(true);
    setMessage({ text: "", error: false });
    try {
      const response = await fetch(`/api/admin/support/account?q=${encodeURIComponent(query.trim())}`, { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Search failed.");
      setAccounts(data.accounts || []);
      setMessage({ text: (data.accounts || []).length ? "" : "No account matches that search.", error: false });
    } catch (error) {
      setAccounts(null);
      setMessage({ text: error instanceof Error ? error.message : "Search failed.", error: true });
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="support-page">
      <h1>Support lookup</h1>
      <p className="support-lead">Find an account when its owner asks for help. View only. Each search is recorded in the audit log; the search text is not stored. Passwords and codes are never shown.</p>
      <form onSubmit={search} className="support-form">
        <label htmlFor="support-query">Email, phone number, account ID or company name</label>
        <div className="support-row">
          <input id="support-query" value={query} onChange={(event) => setQuery(event.target.value)} minLength={3} maxLength={120} required autoComplete="off" />
          <button type="submit" disabled={busy || query.trim().length < 3}>{busy ? "Searching…" : "Search"}</button>
        </div>
      </form>
      {message.text ? <p role={message.error ? "alert" : "status"} className={message.error ? "support-message support-message-error" : "support-message"}>{message.text}</p> : null}
      <div className="support-list">
        {(accounts ?? []).map((account) => (
          <section key={account.id} aria-labelledby={`support-${account.id}`} className="support-card">
            <h2 id={`support-${account.id}`}>{account.companyName} ({account.displayId})</h2>
            <p className="support-sub">
              {account.country}/{account.currency} · {account.planType} · {account.isSoleTrader ? "Sole trader" : "Company"} · joined {day(account.createdAt)}
              {account.isTester ? " · tester" : ""}
            </p>
            {account.deletionRequestedAt ? <p className="support-flag">Deletion requested {day(account.deletionRequestedAt)}</p> : null}
            <dl className="support-facts">
              <div><dt>Person/account verification: </dt><dd>{account.verificationStatus}</dd></div>
              <div><dt>Company verification: </dt><dd>{account.companyVerificationStatus}</dd></div>
              <div><dt>Phone verified: </dt><dd>{yes(account.phoneVerifiedAt)}</dd></div>
            </dl>
            <h3>People</h3>
            <ul className="support-plain">
              {account.users.map((user) => (
                <li key={`${user.name}-${user.email ?? user.phone}`}>
                  {user.name} ({user.role}) · {user.email ?? "no email"} (verified: {yes(user.emailVerifiedAt)}) · {user.phone} · person ID: {yes(user.personVerifiedAt)}
                </li>
              ))}
            </ul>
            <h3>Vehicles</h3>
            {account.vehicles.length ? (
              <ul className="support-plain">{account.vehicles.map((vehicle) => <li key={vehicle.regPlate}>{vehicle.regPlate} · {vehicleTypeLabel(vehicle.vehicleType, account.country)} · {vehicle.verificationStatus}{vehicle.rejectionReason ? ` · ${vehicle.rejectionReason}` : ""}</li>)}</ul>
            ) : <p className="support-sub">None registered.</p>}
            <h3>Recent jobs</h3>
            {account.recentJobs.length ? (
              <ul className="support-plain">{account.recentJobs.map((job) => <li key={job.id}>{day(job.createdAt)} · {job.role} · {job.status} · {job.pickup} → {job.dropoff}</li>)}</ul>
            ) : <p className="support-sub">No jobs.</p>}
            <h3>Latest notifications sent</h3>
            {account.notifications.length ? (
              <ul className="support-plain">{account.notifications.map((item, index) => <li key={`${item.type}-${index}`}>{day(item.createdAt)} · {item.title}{item.readAt ? "" : " (unread)"}</li>)}</ul>
            ) : <p className="support-sub">None.</p>}
          </section>
        ))}
      </div>
    </main>
  );
}
