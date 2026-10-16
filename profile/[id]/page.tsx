"use client";

import { useEffect, useState } from "react";
import { useParams } from "next/navigation";
import Link from "next/link";

export default function ProfilePage() {
  const params = useParams();
  const id = params.id as string;
  const [data, setData] = useState<any>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch(`/api/profile/${id}`)
      .then((res) => res.json())
      .then((d) => {
        if (d.error) setError(d.error);
        else setData(d);
      });
  }, [id]);

  if (error) return <p>{error}</p>;
  if (!data) return <p>Loading...</p>;

  const { account, avgRating, ratingCount, recentRatings, jobsPosted, jobsCompleted } = data;
  const days = Math.floor((Date.now() - new Date(account.createdAt).getTime()) / (1000 * 60 * 60 * 24));

  return (
    <div style={{ maxWidth: 600 }}>
      <p>
        <Link href="/jobs" className="button-link button-link-secondary">← Back to jobs</Link>
      </p>
      <h1>{account.companyName}</h1>
      <p style={{ color: "var(--color-muted)" }}>
        {account.displayId} · {account.isSoleTrader ? "Sole trader" : "Company"} ·{" "}
        {account.country} · on platform {days} day{days === 1 ? "" : "s"}
      </p>

      <p>
        {avgRating ? `★ ${avgRating.toFixed(1)} (${ratingCount} rating${ratingCount === 1 ? "" : "s"})` : "No ratings yet"}
        {" · "}
        {jobsCompleted} job{jobsCompleted === 1 ? "" : "s"} completed
        ` · ${jobsPosted} posted`
      </p>

      {account.vehicles && account.vehicles.length > 0 && (
        <>
          <h3>Vehicles</h3>
          <ul>
            {account.vehicles.map((v: any, i: number) => (
              <li key={i}>
                {v.vehicleType} — {v.regPlate}
              </li>
            ))}
          </ul>
        </>
      )}

      <h3>Recent reviews</h3>
      {recentRatings.length === 0 && <p style={{ color: "var(--color-muted)" }}>No reviews yet.</p>}
      <ul style={{ listStyle: "none", padding: 0 }}>
        {recentRatings.map((r: any, i: number) => (
          <li key={i} style={{ borderBottom: "1px solid var(--color-border)", padding: "8px 0" }}>
            {"★".repeat(r.stars)}
            {r.comment && <p>{r.comment}</p>}
            <p style={{ color: "var(--color-muted)", fontSize: 12 }}>{new Date(r.createdAt).toLocaleDateString()}</p>
          </li>
        ))}
      </ul>
    </div>
  );
}