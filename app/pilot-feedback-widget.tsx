"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { usePathname } from "next/navigation";

type Diagnostics = {
  route: string;
  viewportWidth: number;
  viewportHeight: number;
  screenWidth: number;
  screenHeight: number;
  visualViewportWidth: number;
  visualViewportHeight: number;
  pixelRatio: number;
  orientation: "portrait" | "landscape" | "unknown";
  browserFamily: "Chrome" | "Edge" | "Firefox" | "Safari" | "Samsung Internet" | "WebView" | "Other" | "unknown";
  osFamily: "Android" | "iOS" | "Windows" | "macOS" | "Linux" | "ChromeOS" | "Other" | "unknown";
  platform: "Android" | "iOS" | "Windows" | "macOS" | "Linux" | "ChromeOS" | "Other" | "unknown";
  language: "en-GB" | "en-US" | "en-IN" | "en" | "other" | "unknown";
  touchPoints: number;
  online: boolean;
  standalone: boolean;
  colorScheme: "light" | "dark" | "no-preference" | "unknown";
  reducedMotion: boolean;
};

function browserFamily(): Diagnostics["browserFamily"] {
  const ua = navigator.userAgent;
  if (/SamsungBrowser/i.test(ua)) return "Samsung Internet";
  if (/Edg\//i.test(ua)) return "Edge";
  if (/Firefox\//i.test(ua)) return "Firefox";
  if (/CriOS|Chrome\//i.test(ua) && /\bwv\b|Version\/\d+.*Chrome/i.test(ua)) return "WebView";
  if (/Chrome\//i.test(ua) || /CriOS/i.test(ua)) return "Chrome";
  if (/Safari\//i.test(ua)) return "Safari";
  return "Other";
}

function osFamily(): Diagnostics["osFamily"] {
  const ua = navigator.userAgent;
  if (/Android/i.test(ua)) return "Android";
  if (/iPhone|iPad|iPod/i.test(ua)) return "iOS";
  if (/CrOS/i.test(ua)) return "ChromeOS";
  if (/Windows/i.test(ua)) return "Windows";
  if (/Mac OS X|Macintosh/i.test(ua)) return "macOS";
  if (/Linux/i.test(ua)) return "Linux";
  return "Other";
}

function diagnostics(route: string): Diagnostics {
  const os = osFamily();
  const languageRaw = navigator.language;
  const language: Diagnostics["language"] = ["en-GB", "en-US", "en-IN", "en"].includes(languageRaw)
    ? languageRaw as Diagnostics["language"]
    : "other";
  const platformRaw = (navigator as Navigator & { userAgentData?: { platform?: string } }).userAgentData?.platform || navigator.platform || "";
  const platform: Diagnostics["platform"] =
    /android/i.test(platformRaw) ? "Android" :
    /iphone|ipad|ipod/i.test(platformRaw) ? "iOS" :
    /win/i.test(platformRaw) ? "Windows" :
    /mac/i.test(platformRaw) ? "macOS" :
    /cros|chromeos/i.test(platformRaw) ? "ChromeOS" :
    /linux/i.test(platformRaw) ? "Linux" : os;
  const visual = window.visualViewport;
  const standaloneMedia = window.matchMedia("(display-mode: standalone)").matches;
  const iosStandalone = Boolean((navigator as Navigator & { standalone?: boolean }).standalone);
  const orientation = window.innerWidth === window.innerHeight ? "unknown" : window.innerWidth > window.innerHeight ? "landscape" : "portrait";
  const scheme = window.matchMedia("(prefers-color-scheme: dark)").matches ? "dark" :
    window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "no-preference";
  return {
    route,
    viewportWidth: window.innerWidth,
    viewportHeight: window.innerHeight,
    screenWidth: window.screen.width,
    screenHeight: window.screen.height,
    visualViewportWidth: Math.round(visual?.width ?? window.innerWidth),
    visualViewportHeight: Math.round(visual?.height ?? window.innerHeight),
    pixelRatio: window.devicePixelRatio || 1,
    orientation,
    browserFamily: browserFamily(),
    osFamily: os,
    platform,
    language,
    touchPoints: navigator.maxTouchPoints || 0,
    online: navigator.onLine,
    standalone: standaloneMedia || iosStandalone,
    colorScheme: scheme,
    reducedMotion: window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  };
}

const initialForm = {
  category: "layout",
  severity: "medium",
  task: "job-posting",
  description: "",
  steps: "",
};

export default function PilotFeedbackWidget() {
  const pathname = usePathname() || "/";
  const [enabled, setEnabled] = useState(false);
  const [participantId, setParticipantId] = useState("");
  const [open, setOpen] = useState(false);
  const [consent, setConsent] = useState<"unknown" | "yes" | "no">("unknown");
  const [form, setForm] = useState(initialForm);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState("");
  const [reference, setReference] = useState("");
  const lastViewKey = useRef("");

  useEffect(() => {
    let alive = true;
    fetch("/api/pilot/feedback", { method: "GET", cache: "no-store" })
      .then(async response => response.ok ? response.json() : null)
      .then(data => {
        if (!alive || !data?.enabled || typeof data.participantId !== "string") return;
        const id = data.participantId;
        setParticipantId(id);
        setEnabled(true);
        try {
          const saved = window.localStorage.getItem("p2d-pilot-consent-v1:" + id);
          if (saved === "yes" || saved === "no") setConsent(saved);
        } catch { setConsent("unknown"); }
      })
      .catch(() => undefined);
    return () => { alive = false; };
  }, []);

  const recordView = useCallback(async () => {
    if (!enabled || consent !== "yes" || !participantId) return;
    const snapshot = diagnostics(pathname);
    const viewKey = [participantId, pathname, snapshot.viewportWidth, snapshot.viewportHeight, snapshot.screenWidth, snapshot.screenHeight, snapshot.pixelRatio, snapshot.orientation, snapshot.standalone].join("|");
    if (viewKey === lastViewKey.current) return;
    lastViewKey.current = viewKey;
    try {
      const storageKey = "p2d-pilot-view-v1:" + viewKey;
      if (window.sessionStorage.getItem(storageKey)) return;
      window.sessionStorage.setItem(storageKey, "1");
      const response = await fetch("/api/pilot/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ kind: "view", route: pathname, client: snapshot }),
        keepalive: true,
      });
      if (!response.ok) {
        try { window.sessionStorage.removeItem(storageKey); } catch {}
      }
    } catch { /* Diagnostic collection must never interrupt the task. */ }
  }, [enabled, consent, participantId, pathname]);

  useEffect(() => { void recordView(); }, [recordView]);

  useEffect(() => {
    if (!enabled || consent !== "yes") return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const recordAfterResize = () => {
      if (timer) clearTimeout(timer);
      timer = setTimeout(() => { void recordView(); }, 500);
    };
    window.addEventListener("resize", recordAfterResize, { passive: true });
    window.addEventListener("orientationchange", recordAfterResize, { passive: true });
    window.visualViewport?.addEventListener("resize", recordAfterResize, { passive: true });
    return () => {
      if (timer) clearTimeout(timer);
      window.removeEventListener("resize", recordAfterResize);
      window.removeEventListener("orientationchange", recordAfterResize);
      window.visualViewport?.removeEventListener("resize", recordAfterResize);
    };
  }, [enabled, consent, recordView]);

  function chooseConsent(value: "yes" | "no") {
    setConsent(value);
    try { window.localStorage.setItem("p2d-pilot-consent-v1:" + participantId, value); } catch {}
    if (value === "no") {
      setOpen(false);
      return;
    }
    setMessage("Pilot diagnostics enabled for this browser.");
    window.setTimeout(() => setMessage(""), 3500);
  }

  async function submit(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!enabled) return;
    setBusy(true);
    setMessage("");
    setReference("");
    try {
      const response = await fetch("/api/pilot/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          kind: "feedback",
          route: pathname,
          client: diagnostics(pathname),
          category: form.category,
          severity: form.severity,
          task: form.task,
          description: form.description,
          steps: form.steps,
        }),
      });
      const data = await response.json().catch(() => ({}));
      if (!response.ok) throw new Error(data.error || "Feedback could not be saved. Try again.");
      setReference(String(data.reference || ""));
      setMessage("Feedback saved. Include the reference below when you share screenshots or screen recordings with the pilot coordinator.");
      setForm(initialForm);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : "Feedback could not be saved.");
    } finally {
      setBusy(false);
    }
  }

  if (!enabled) return null;

  const buttonStyle: React.CSSProperties = {
    border: "1px solid #64748b",
    borderRadius: 999,
    padding: "10px 14px",
    background: "#0f172a",
    color: "#fff",
    fontWeight: 650,
    boxShadow: "0 4px 18px rgba(0,0,0,.2)",
    cursor: "pointer",
  };
  const panelStyle: React.CSSProperties = {
    position: "fixed",
    zIndex: 1000,
    right: "max(12px, env(safe-area-inset-right))",
    bottom: "max(12px, env(safe-area-inset-bottom))",
    width: "min(400px, calc(100vw - 24px))",
    maxHeight: "min(82dvh, 760px)",
    overflowY: "auto",
    background: "var(--color-surface, #fff)",
    color: "var(--color-text, #111827)",
    border: "1px solid var(--color-border, #d1d5db)",
    borderRadius: 16,
    padding: 16,
    boxShadow: "0 16px 48px rgba(0,0,0,.25)",
  };
  const fieldStyle: React.CSSProperties = {
    boxSizing: "border-box",
    width: "100%",
    padding: "9px 10px",
    marginTop: 5,
    border: "1px solid var(--color-border, #cbd5e1)",
    borderRadius: 8,
    background: "var(--color-background, #fff)",
    color: "inherit",
    font: "inherit",
  };

  return <>
    <div style={{ position: "fixed", zIndex: 999, right: "max(12px, env(safe-area-inset-right))", bottom: "max(12px, env(safe-area-inset-bottom))" }}>
      {!open && <button type="button" style={buttonStyle} onClick={() => setOpen(true)} aria-haspopup="dialog" aria-expanded={open}>Pilot feedback</button>}
    </div>
    {open && <section role="dialog" aria-modal="false" aria-labelledby="pilot-feedback-title" style={panelStyle}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", gap: 12 }}>
        <div>
          <h2 id="pilot-feedback-title" style={{ fontSize: 20, fontWeight: 750, margin: "0 0 4px" }}>UK student pilot</h2>
          <p style={{ fontSize: 12, opacity: .75, margin: 0 }}>Participant {participantId}</p>
        </div>
        <button type="button" onClick={() => setOpen(false)} aria-label="Close pilot feedback" style={{ border: 0, background: "transparent", color: "inherit", fontSize: 24, cursor: "pointer" }}>×</button>
      </div>
      {consent !== "yes" ? <div style={{ marginTop: 12 }}>
        <p style={{ fontSize: 14, lineHeight: 1.5 }}>To help us test mobile layout, you can share the current app route, screen and viewport dimensions, pixel density, orientation, touch capability, browser/OS family and display preferences. These diagnostics are linked to your pilot account. We do not record your screen, audio, location, passwords or full browser history. Do not include personal or confidential information in feedback.</p>
        <p style={{ fontSize: 14, lineHeight: 1.5 }}>Screenshots and screen recordings are not uploaded automatically. Share them separately with the pilot coordinator using the report reference.</p>
        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <button type="button" onClick={() => chooseConsent("yes")} style={buttonStyle}>Enable diagnostics</button>
          <button type="button" onClick={() => chooseConsent("no")} style={{ ...buttonStyle, background: "transparent", color: "inherit" }}>Not now</button>
        </div>
      </div> : <form onSubmit={submit} style={{ display: "grid", gap: 10, marginTop: 12 }}>
        <p style={{ fontSize: 13, lineHeight: 1.4, margin: 0 }}>Screen/layout diagnostics are recorded when you visit a page or rotate/resize the app. Send a report when something fails or looks wrong.</p>
        <label style={{ display: "block", fontSize: 13 }}>What type of issue?
          <select style={fieldStyle} value={form.category} onChange={e => setForm(v => ({ ...v, category: e.target.value }))}>
            <option value="layout">Layout / screen size</option><option value="navigation">Navigation</option><option value="workflow">Workflow confusion</option><option value="bug">Something is broken</option><option value="performance">Slow / freezes</option><option value="accessibility">Accessibility</option><option value="other">Other</option>
          </select>
        </label>
        <label style={{ display: "block", fontSize: 13 }}>Severity
          <select style={fieldStyle} value={form.severity} onChange={e => setForm(v => ({ ...v, severity: e.target.value }))}>
            <option value="low">Low — cosmetic</option><option value="medium">Medium — workaround exists</option><option value="high">High — task is difficult</option><option value="blocking">Blocking — cannot continue</option>
          </select>
        </label>
        <label style={{ display: "block", fontSize: 13 }}>Task you were trying to complete
          <select style={fieldStyle} value={form.task} onChange={e => setForm(v => ({ ...v, task: e.target.value }))}>
            <option value="signup-login">Sign in / access</option><option value="profile">Profile</option><option value="job-posting">Post a job</option><option value="job-search">Find jobs</option><option value="bidding">Submit a bid</option><option value="acceptance">Accept / award a job</option><option value="pickup">Confirm pickup</option><option value="delivery">Mark / confirm delivery</option><option value="notifications">Notifications</option><option value="other">Other</option>
          </select>
        </label>
        <label style={{ display: "block", fontSize: 13 }}>What happened? (required)
          <textarea required minLength={5} maxLength={1800} rows={4} style={{ ...fieldStyle, resize: "vertical" }} value={form.description} onChange={e => setForm(v => ({ ...v, description: e.target.value }))} placeholder="Describe what you saw, what you expected and which screen looked wrong." />
        </label>
        <label style={{ display: "block", fontSize: 13 }}>Steps to reproduce (optional)
          <textarea maxLength={1400} rows={2} style={{ ...fieldStyle, resize: "vertical" }} value={form.steps} onChange={e => setForm(v => ({ ...v, steps: e.target.value }))} placeholder="1. Open… 2. Tap… 3. The issue appears…" />
        </label>
        <button type="submit" disabled={busy} style={{ ...buttonStyle, borderRadius: 8, opacity: busy ? .7 : 1 }}>{busy ? "Submitting…" : "Submit feedback"}</button>
        {reference && <p style={{ margin: 0, fontSize: 13 }}><strong>Reference: {reference}</strong></p>}
        {message && <p role="status" aria-live="polite" style={{ margin: 0, fontSize: 13 }}>{message}</p>}
        <p style={{ fontSize: 12, opacity: .75, margin: 0 }}>For a screenshot, use your device’s screenshot function and send it with the reference above. Never include passwords, ID documents, payment details, or real customer information.</p>
      </form>}
      {consent === "yes" && message && !reference && <p role="status" style={{ fontSize: 12 }}>{message}</p>}
    </section>}
  </>;
}
