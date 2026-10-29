"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import { useSession } from "next-auth/react";
import { collectPilotDiagnostics, PILOT_DIAGNOSTICS_STORAGE_KEY } from "@/lib/pilotDiagnostics";

export default function PilotFeedbackLauncher() {
  const pathname = usePathname();
  const router = useRouter();
  const { status } = useSession();
  const [pilotEnabled, setPilotEnabled] = useState(false);

  useEffect(() => {
    let active = true;
    if (status !== "authenticated") {
      setPilotEnabled(false);
      return () => { active = false; };
    }
    fetch("/api/pilot/feedback", { method: "GET", cache: "no-store" })
      .then(async response => response.ok ? response.json() : null)
      .then(data => { if (active && data?.enabled === true) setPilotEnabled(true); })
      .catch(() => { if (active) setPilotEnabled(false); });
    return () => { active = false; };
  }, [status]);

  if (status !== "authenticated" || !pilotEnabled || pathname === "/pilot-feedback" || pathname.startsWith("/admin/pilot")) return null;

  function reportIssue() {
    try {
      sessionStorage.setItem(PILOT_DIAGNOSTICS_STORAGE_KEY, JSON.stringify(collectPilotDiagnostics()));
    } catch {
      // Storage may be blocked in a private WebView; the feedback page will recapture diagnostics.
    }
    router.push("/pilot-feedback");
  }

  return (
    <button
      type="button"
      onClick={reportIssue}
      aria-label="Report a UK-market QA issue from this screen"
      title="Report an issue and capture this screen's layout diagnostics"
      style={{
        position: "fixed",
        right: 14,
        bottom: "calc(78px + env(safe-area-inset-bottom))",
        zIndex: 1000,
        minHeight: 44,
        padding: "10px 14px",
        borderRadius: 999,
        border: "1px solid var(--color-border, #d1d5db)",
        background: "var(--color-surface, #fff)",
        color: "var(--color-text, #111827)",
        boxShadow: "0 3px 14px rgba(0,0,0,.18)",
        fontWeight: 700,
        fontSize: 14,
      }}
    >
      Report issue
    </button>
  );
}
