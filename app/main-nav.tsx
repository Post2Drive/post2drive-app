"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";
import ServiceTiles from "@/components/service-tiles";
import { getServiceLinks, isServiceActive } from "@/lib/serviceLinks";

export default function MainNav({ showQaCampaigns = false, showStudentPilot = false }: { showQaCampaigns?: boolean; showStudentPilot?: boolean }) {
  const pathname = usePathname();
  const { data: session, status } = useSession();
  const [moreOpen, setMoreOpen] = useState(false);
  const moreButtonRef = useRef<HTMLButtonElement>(null);
  const country = (session?.user as any)?.country;
  const links = getServiceLinks(country, { showQaCampaigns, showStudentPilot });
  const current = links.find((link) => isServiceActive(pathname, link.href));

  // Close the menu whenever the route changes.
  useEffect(() => {
    setMoreOpen(false);
  }, [pathname]);

  if (status !== "authenticated") return null;

  return (
    <header
      className="main-nav-header"
      onKeyDown={(event) => {
        if (event.key === "Escape" && moreOpen) {
          setMoreOpen(false);
          moreButtonRef.current?.focus();
        }
      }}
    >
      <nav className="main-nav-inner service-nav" aria-label="Main navigation">
        <Link
          href="/dashboard"
          className="main-nav-brand"
          aria-current={pathname === "/dashboard" ? "page" : undefined}
        >
          Post2Drive
        </Link>
        {current && current.href !== "/dashboard" && (
          <span className="service-nav-current">{current.label}</span>
        )}
        <button
          ref={moreButtonRef}
          type="button"
          className="service-menu-button"
          aria-expanded={moreOpen}
          aria-controls="mobile-more-menu"
          onClick={() => setMoreOpen((open) => !open)}
        >
          <svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true" focusable="false">
            <path d="M4 4h6v6H4zM14 4h6v6h-6zM4 14h6v6H4zM14 14h6v6h-6z" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinejoin="round" />
          </svg>
          <span>Menu</span>
        </button>
      </nav>
      <div id="mobile-more-menu" className="service-menu-panel" hidden={!moreOpen} role="region" aria-label="All services">
        <ServiceTiles
          links={links}
          activeHref={current?.href}
          onNavigate={() => setMoreOpen(false)}
          compact
        />
      </div>
    </header>
  );
}
