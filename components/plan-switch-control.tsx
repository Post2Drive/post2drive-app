"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Props = {
  /** Switch request time, if the account has asked to return to the poster plan. */
  requestedAt: string | null;
  /** When the driver/fleet plan ends (end of the current 7-day period, or the 14-day fallback). */
  effectiveLabel: string | null;
};

/**
 * Driver -> poster switch (EXECUTION_PLAN §3): takes effect at the end of the current 7-day
 * period, and can be cancelled until then. An infrequent action, so no animation.
 */
export default function PlanSwitchControl({ requestedAt, effectiveLabel }: Props) {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  async function submit(method: "POST" | "DELETE") {
    if (busy) return;
    setBusy(true);
    setError("");
    try {
      const response = await fetch("/api/account/plan/switch-to-poster", { method, cache: "no-store" });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) {
        setError(data.error || "Could not update your plan. Try again.");
        return;
      }
      router.refresh();
    } catch {
      setError("Network error. Your plan was not changed.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div style={{ marginTop: 12 }}>
      {requestedAt ? (
        <>
          <p role="status">
            You will move to the poster plan{effectiveLabel ? <> on <strong>{effectiveLabel}</strong></> : " at the end of your current 7-day period"}. Taking jobs stops then; posting continues.
          </p>
          <button type="button" onClick={() => void submit("DELETE")} disabled={busy} aria-busy={busy}>
            {busy ? "Cancelling…" : "Keep my driver plan"}
          </button>
        </>
      ) : (
        <>
          <p>
            Only posting jobs? You can switch to the poster plan at the end of your current 7-day period{effectiveLabel ? ` (${effectiveLabel})` : ""}.
          </p>
          <button type="button" onClick={() => void submit("POST")} disabled={busy} aria-busy={busy}>
            {busy ? "Saving…" : "Switch to poster plan"}
          </button>
        </>
      )}
      {error && <p role="alert">{error}</p>}
    </div>
  );
}
