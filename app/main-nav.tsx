"use client";

import { useRef, useState } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";

const baseLinks = [
  { href: "/dashboard", label: "Home" },
  { href: "/jobs", label: "Marketplace" },
  { href: "/jobs/new", label: "Post a Job" },
  { href: "/vehicles", label: "Vehicles" },
  { href: "/payments", label: "Payments" },
  { href: "/settings", label: "Account" },
  { href: "/admin", label: "Admin" },
];

function isActive(pathname: string, href: string) {
  return pathname === href ||
    (href === "/jobs" && pathname.startsWith("/jobs/") && pathname !== "/jobs/new");
}

function mobileLabel(href: string, fallback: string) {
  switch (href) {
    case "/dashboard": return "Home";
    case "/jobs": return "Jobs";
    case "/jobs/new": return "Post";
    case "/vehicles": return "Vehicles";
    default: return fallback;
  }
}

export default function MainNav({ showQaCampaigns = false }: { showQaCampaigns?: boolean }) {
  const pathname = usePathname();
  const { data: session, status } = useSession();
  const [moreOpen, setMoreOpen] = useState(false);
  const moreButtonRef = useRef<HTMLButtonElement>(null);
  const country = (session?.user as any)?.country;
  const marketLinks = country === "IN"
    ? [...baseLinks.slice(0, 2), { href: "/requirements", label: "My Requirements" }, ...baseLinks.slice(2)]
    : baseLinks;
  const links = showQaCampaigns
    ? [...marketLinks, { href: "/admin/qa-campaigns", label: "QA Campaigns" }]
    : marketLinks;
  const mobilePrimary = links.filter((link) =>
    ["/dashboard", "/jobs", "/jobs/new", "/vehicles"].includes(link.href)
  );
  const mobileMore = links.filter((link) => !mobilePrimary.some((item) => item.href === link.href));
  const moreActive = mobileMore.some((link) => isActive(pathname, link.href));

  if (status !== "authenticated") return null;

  return (
    <>
      <header className="main-nav-header">
        <nav className="main-nav-inner" aria-label="Main navigation">
          <Link href="/dashboard" className="main-nav-brand" aria-label="Post2Drive dashboard home">Post2Drive</Link>
          <div className="desktop-nav">
            {links.map((link) => {
              const active = isActive(pathname, link.href);
              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className={`main-nav-link${active ? " is-active" : ""}`}
                  aria-current={active ? "page" : undefined}
                  style={{
                    fontWeight: active ? 700 : 600,
                    color: active ? "var(--color-primary-action)" : "var(--color-text)",
                    background: active ? "var(--color-action-soft)" : "transparent",
                  }}
                >
                  {link.label}
                </Link>
              );
            })}
          </div>
        </nav>
      </header>

      <nav
        className="mobile-bottom-nav"
        aria-label="Mobile navigation"
        onKeyDown={(event) => {
          if (event.key === "Escape" && moreOpen) {
            setMoreOpen(false);
            moreButtonRef.current?.focus();
          }
        }}
      >
        {mobilePrimary.map((link) => {
          const active = isActive(pathname, link.href);
          return (
            <Link
              key={link.href}
              href={link.href}
              className="mobile-nav-link"
              aria-current={active ? "page" : undefined}
              aria-label={mobileLabel(link.href, link.label)}
              onClick={() => setMoreOpen(false)}
              style={{
                fontWeight: active ? 800 : 600,
                color: active ? "var(--color-primary-action)" : "var(--color-muted)",
              }}
            >
              <span className="mobile-nav-label">{mobileLabel(link.href, link.label)}</span>
            </Link>
          );
        })}
        <button
          ref={moreButtonRef}
          type="button"
          className={`mobile-nav-more${moreActive ? " is-active" : ""}`}
          aria-expanded={moreOpen}
          aria-label={moreOpen ? "Close more navigation" : "More navigation"}
          aria-controls="mobile-more-menu"
          onClick={() => setMoreOpen((open) => !open)}
        >
          <span aria-hidden="true">⋯</span>
          <span>More</span>
        </button>
        <div id="mobile-more-menu" className="mobile-more-menu" hidden={!moreOpen} role="region" aria-label="More navigation links">
          {mobileMore.map((link) => {
            const active = isActive(pathname, link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                className="mobile-more-link"
                aria-current={active ? "page" : undefined}
                onClick={() => setMoreOpen(false)}
              >
                {link.label}
              </Link>
            );
          })}
        </div>
      </nav>
    </>
  );
}
