"use client";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";

type Notice = {
  id: string;
  type: string;
  title: string;
  body: string;
  jobId: string | null;
  readAt: string | null;
  createdAt: string;
};

export default function NotificationCenter() {
  const [items, setItems] = useState<Notice[]>([]);
  const [unread, setUnread] = useState(0);
  const [error, setError] = useState("");
  const [busyId, setBusyId] = useState("");

  const refresh = useCallback(async () => {
    const response = await fetch("/api/notifications?limit=10", { cache: "no-store" });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || "Could not load notifications.");
    setItems(data.notifications || []);
    setUnread(data.unreadCount || 0);
  }, []);

  useEffect(() => {
    refresh().catch((reason) => setError(reason instanceof Error ? reason.message : "Could not load notifications."));
  }, [refresh]);

  async function markRead(id: string) {
    setBusyId(id);
    setError("");
    try {
      const response = await fetch(`/api/notifications/${id}/read`, { method: "POST" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Could not mark notification as read.");
      await refresh();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Could not mark notification as read.");
    } finally {
      setBusyId("");
    }
  }

  return (
    <section style={{ marginTop: 20, border: "1px solid var(--color-border)", borderRadius: 12, padding: 16 }}>
      <div style={{ display: "flex", gap: 12, alignItems: "center", justifyContent: "space-between", flexWrap: "wrap" }}>
        <h2 style={{ margin: 0 }}>Notifications {unread > 0 ? `· ${unread} unread` : ""}</h2>
        <button onClick={() => refresh().catch((reason) => setError(reason instanceof Error ? reason.message : "Refresh failed."))} style={{ padding: "6px 10px" }}>Refresh</button>
      </div>
      {error && <p role="alert">{error}</p>}
      {items.length === 0 ? <p>No notifications yet.</p> : (
        <div style={{ display: "grid", gap: 10, marginTop: 12 }}>
          {items.map((item) => (
            <article key={item.id} style={{ border: "1px solid var(--color-border)", borderRadius: 8, padding: 12, opacity: item.readAt ? 0.75 : 1 }}>
              <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap" }}>
                <strong>{item.title}</strong>
                <span style={{ fontSize: 12, color: "var(--color-muted)" }}>{new Date(item.createdAt).toLocaleString()}</span>
              </div>
              <p>{item.body}</p>
              <div style={{ display: "flex", gap: 12, flexWrap: "wrap" }}>
                {item.jobId && <Link href={item.type.includes("incident") || item.type === "delivery_rejected" ? `/jobs/${item.jobId}/incidents` : "/jobs"}>{item.type.includes("incident") || item.type === "delivery_rejected" ? "Open incident history" : "Open jobs"}</Link>}
                {!item.readAt && <button disabled={busyId === item.id} onClick={() => markRead(item.id)}>{busyId === item.id ? "Saving…" : "Mark as read"}</button>}
              </div>
            </article>
          ))}
        </div>
      )}
    </section>
  );
}
