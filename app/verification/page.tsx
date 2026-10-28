"use client";

import { useState } from "react";
import type { FormEvent } from "react";

export default function VerificationPage() {
  const [companyName, setCompanyName] = useState("");
  const [companyNumber, setCompanyNumber] = useState("");
  const [isSoleTrader, setIsSoleTrader] = useState(false);
  const [message, setMessage] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBusy(true);
    setMessage("");
    try {
      const response = await fetch("/api/company-verification", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ companyName, companyNumber, isSoleTrader }),
      });
      const result = await response.json();
      if (!response.ok) throw new Error(result.error || "Unable to submit company details.");
      setMessage("Company details submitted for manual review. Posting remains restricted until approval.");
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Unable to submit company details.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-10">
      <h1 className="text-2xl font-semibold">Company verification</h1>
      <p className="mt-2 text-sm text-gray-600">Submit your trading details for administrator review. Submission does not automatically approve the company.</p>
      <form onSubmit={submit} className="mt-6 space-y-4">
        <label className="block text-sm font-medium">Company or trading name
          <input required minLength={2} maxLength={160} value={companyName} onChange={(e) => setCompanyName(e.target.value)} className="mt-1 w-full rounded border px-3 py-2" />
        </label>
        <label className="block text-sm font-medium">Company registration number (if applicable)
          <input maxLength={80} value={companyNumber} onChange={(e) => setCompanyNumber(e.target.value)} className="mt-1 w-full rounded border px-3 py-2" />
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={isSoleTrader} onChange={(e) => setIsSoleTrader(e.target.checked)} />
          I operate as a sole trader
        </label>
        <button disabled={busy} type="submit" className="rounded bg-black px-4 py-2 text-white disabled:opacity-50">{busy ? "Submitting…" : "Submit for review"}</button>
        {message ? <p role="status" className="text-sm">{message}</p> : null}
      </form>
    </main>
  );
}
