"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { CONSENT_EVENT, OPEN_CONSENT_EVENT, readConsent, writeConsent, type ConsentState } from "@/lib/consent";

/**
 * Shown until the visitor chooses. Both choices are equally prominent, and
 * nothing optional runs before "Allow analytics".
 */
export default function ConsentBanner() {
  const [open, setOpen] = useState(false);
  const firstButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!readConsent()) setOpen(true);
    const reopen = () => {
      setOpen(true);
      requestAnimationFrame(() => firstButton.current?.focus());
    };
    window.addEventListener(OPEN_CONSENT_EVENT, reopen);
    return () => window.removeEventListener(OPEN_CONSENT_EVENT, reopen);
  }, []);

  if (!open) return null;

  const choose = (analytics: boolean) => {
    writeConsent(analytics);
    setOpen(false);
  };

  return (
    <section className="consent-banner" role="region" aria-label="Cookie choices">
      <p>
        We use essential cookies to keep you signed in. Optional analytics would help us improve Post2Drive, and stays off unless you allow it.{" "}
        <Link href="/cookies">Cookie details</Link>
      </p>
      <div className="consent-actions">
        <button ref={firstButton} type="button" className="consent-button" onClick={() => choose(false)}>
          Essential only
        </button>
        <button type="button" className="consent-button" onClick={() => choose(true)}>
          Allow analytics
        </button>
      </div>
    </section>
  );
}

/** Renders children (e.g. an analytics <Script>) only after the visitor allows analytics. */
export function AnalyticsConsentGate({ children }: { children: React.ReactNode }) {
  const [allowed, setAllowed] = useState(false);
  useEffect(() => {
    setAllowed(readConsent()?.analytics === true);
    const onChange = (event: Event) => setAllowed((event as CustomEvent<ConsentState>).detail?.analytics === true);
    window.addEventListener(CONSENT_EVENT, onChange);
    return () => window.removeEventListener(CONSENT_EVENT, onChange);
  }, []);
  return allowed ? <>{children}</> : null;
}

export function CookieSettingsButton({ className }: { className?: string }) {
  return (
    <button type="button" className={className} onClick={() => window.dispatchEvent(new Event(OPEN_CONSENT_EVENT))}>
      Cookie settings
    </button>
  );
}
