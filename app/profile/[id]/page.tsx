"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";
import { COUNTRIES } from "@/lib/currency";
import { formatMarketDate } from "@/lib/localisation";
import { vehicleTypeLabel } from "@/lib/vehicles";

export default function ProfilePage() {
  const params = useParams();
  const id = params.id as string;
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState("");
  const [loadAttempt, setLoadAttempt] = useState(0);

  useEffect(() => {
    let active = true;
    setError("");
    setData(null);

    fetch(`/api/profile/${encodeURIComponent(id)}`, { cache: "no-store" })
      .then(async (response) => {
        const result = await response.json().catch(() => ({}));
        if (!response.ok || result.error) {
          throw new Error(result.error || "Could not load this profile. Try again.");
        }
        return result;
      })
      .then((result) => {
        if (active) setData(result);
      })
      .catch((reason) => {
        if (active) setError(reason instanceof Error ? reason.message : "Could not load this profile. Check your connection and try again.");
      });

    return () => {
      active = false;
    };
  }, [id, loadAttempt]);

  if (error) {
    return (
      <main style={{ maxWidth: 600, margin: "0 auto", padding: "24px 16px 48px" }}>
        <h1>Public profile unavailable</h1>
        <p role="alert">{error}</p>
        <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
          <button type="button" onClick={() => setLoadAttempt((attempt) => attempt + 1)}>Retry loading profile</button>
          <Link href="/jobs" className="button-link button-link-secondary">← Back to jobs</Link>
        </div>
      </main>
    );
  }

  if (!data) {
    return (
      <main style={{ maxWidth: 600, margin: "0 auto", padding: "24px 16px 48px" }}>
        <h1>Public profile</h1>
        <p role="status" aria-live="polite">Loading profile…</p>
      </main>
    );
  }

  const { account, avgRating, ratingCount, recentRatings, jobsPosted, jobsCompleted } = data;
  const days = Math.floor((Date.now() - new Date(account.createdAt).getTime()) / (1000 * 60 * 60 * 24));
  const countryName = COUNTRIES.find((market) => market.code === account.country)?.name ?? account.country;

  return (
    <main className="profile-page" style={{ width: "100%", maxWidth: 760, margin: "0 auto", padding: "24px 16px 48px", boxSizing: "border-box" }}>
      <p>
        <Link href="/jobs" className="button-link button-link-secondary">← Back to jobs</Link>
      </p>
      <h1>{account.companyName}</h1>
      <p style={{ color: "var(--color-muted)" }}>
        {account.displayId} · {account.isSoleTrader ? "Sole trader" : "Company"} ·{" "}
        {countryName} · on platform {days} day{days === 1 ? "" : "s"}
      </p>

      <p>
        {avgRating ? `★ ${avgRating.toFixed(1)} (${ratingCount} rating${ratingCount === 1 ? "" : "s"})` : "No ratings yet"}
        {" · "}
        {jobsCompleted} job{jobsCompleted === 1 ? "" : "s"} completed · {jobsPosted} posted
      </p>

      {account.vehicles && account.vehicles.length > 0 && (
        <>
          <h2>Vehicles</h2>
          <ul>
            {account.vehicles.map((v: any, i: number) => (
              <li key={i}>
                {vehicleTypeLabel(v.vehicleType, account.country)} — {v.regPlate}
              </li>
            ))}
          </ul>
        </>
      )}

      <h2>Recent reviews</h2>
      {recentRatings.length === 0 && <p style={{ color: "var(--color-muted)" }} role="status">No reviews yet.</p>}
      <ul style={{ listStyle: "none", padding: 0 }}>
        {recentRatings.map((r: any, i: number) => (
          <li key={i} style={{ borderBottom: "1px solid var(--color-border)", padding: "8px 0" }}>
            {"★".repeat(r.stars)}
            {r.comment && <p>{r.comment}</p>}
            <p style={{ color: "var(--color-muted)", fontSize: 12 }}>{formatMarketDate(r.createdAt, { country: account.country, currency: account.currency })}</p>
          </li>
        ))}
      </ul>
    </main>
  );
}
