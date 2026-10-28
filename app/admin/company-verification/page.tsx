"use client";

import { useCallback, useEffect, useState } from "react";

type Company = {
  id: string;
  companyName: string;
  companyNumber: string | null;
  isSoleTrader: boolean;
  country: string;
  currency: string;
  verificationStatus: string;
  companyVerificationStatus: string;
  companyVerificationSubmittedAt: string | null;
};

export default function CompanyVerificationAdminPage() {
  const [companies, setCompanies] = useState<Company[]>([]);
  const [message, setMessage] = useState("Loading submissions…");
  const [busyId, setBusyId] = useState("");
  const [notes, setNotes] = useState<Record<string, string>>({});

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/admin/company-verification", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to load submissions.");
      setCompanies(data.companies || []);
      setMessage((data.companies || []).length ? "" : "No company submissions are awaiting review.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to load submissions.");
    }
  }, []);

  useEffect(() => { void load(); }, [load]);

  async function review(company: Company, decision: "verified" | "failed" | "manual_review") {
    setBusyId(company.id);
    setMessage("");
    try {
      const response = await fetch("/api/admin/company-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ accountId: company.id, decision, notes: notes[company.id] || "" }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Unable to save review.");
      setCompanies((current) => current.filter((item) => item.id !== company.id));
      setMessage("Review decision saved and audit logged.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to save review.");
    } finally {
      setBusyId("");
    }
  }

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-10">
      <h1 className="text-2xl font-semibold">Company verification review</h1>
      <p className="mt-2 text-sm text-gray-600">Review submitted details. Approve only after independently checking the required evidence outside this form.</p>
      {message ? <p role="status" className="my-4 text-sm">{message}</p> : null}
      <div className="mt-6 space-y-4">
        {companies.map((company) => (
          <section key={company.id} className="rounded border p-4">
            <h2 className="font-semibold">{company.companyName}</h2>
            <p className="mt-1 text-sm">Account: {company.id}</p>
            <p className="text-sm">Registration: {company.companyNumber || "Not supplied"} · {company.isSoleTrader ? "Sole trader" : "Company"} · {company.country}/{company.currency}</p>
            <p className="text-sm">Identity status: {company.verificationStatus} · Submitted: {company.companyVerificationSubmittedAt ? new Date(company.companyVerificationSubmittedAt).toLocaleString() : "Unknown"}</p>
            <label className="mt-3 block text-sm">Review notes
              <textarea maxLength={1000} value={notes[company.id] || ""} onChange={(e) => setNotes((current) => ({ ...current, [company.id]: e.target.value }))} className="mt-1 w-full rounded border px-3 py-2" rows={2} />
            </label>
            <div className="mt-3 flex flex-wrap gap-2">
              <button disabled={Boolean(busyId)} onClick={() => void review(company, "verified")} className="rounded bg-black px-3 py-2 text-sm text-white disabled:opacity-50">Approve</button>
              <button disabled={Boolean(busyId)} onClick={() => void review(company, "failed")} className="rounded border px-3 py-2 text-sm disabled:opacity-50">Reject</button>
              <button disabled={Boolean(busyId)} onClick={() => void review(company, "manual_review")} className="rounded border px-3 py-2 text-sm disabled:opacity-50">Keep in manual review</button>
            </div>
          </section>
        ))}
      </div>
    </main>
  );
}
