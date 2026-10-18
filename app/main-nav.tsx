"use client";

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
];

export default function MainNav() {
  const pathname = usePathname();
  const { data: session, status } = useSession();
  const country = (session?.user as any)?.country;
  const links = country === "IN"
    ? [...baseLinks.slice(0, 2), { href: "/requirements", label: "My Requirements" }, ...baseLinks.slice(2)]
    : baseLinks;

  if (status !== "authenticated") return null;

  return (
    <>
      <header
        style={{
          position: "sticky",
          top: 0,
          zIndex: 50,
          background: "var(--color-surface)",
          borderBottom: "1px solid var(--color-border)",
        }}
      >
        <nav
          aria-label="Main navigation"
          style={{
            maxWidth: 1100,
            margin: "0 auto",
            minHeight: 64,
            padding: "0 20px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 20,
          }}
        >
          <Link
            href="/dashboard"
            style={{
              color: "var(--color-primary)",
              textDecoration: "none",
              fontSize: 21,
              fontWeight: 800,
              whiteSpace: "nowrap",
            }}
          >
            Post2Drive
          </Link>

          <div
            className="desktop-nav"
            style={{
              display: "flex",
              alignItems: "center",
              gap: 6,
            }}
          >
            {links.map((link) => {
              const active =
                pathname === link.href ||
                (link.href === "/jobs" &&
                  pathname.startsWith("/jobs/") &&
                  pathname !== "/jobs/new");

              return (
                <Link
                  key={link.href}
                  href={link.href}
                  className="main-nav-link"
                  aria-current={active ? "page" : undefined}
                  style={{
                    padding: "9px 12px",
                    borderRadius: 8,
                    textDecoration: "none",
                    fontSize: 14,
                    fontWeight: active ? 700 : 600,
                    color: active
                      ? "var(--color-primary-action)"
                      : "var(--color-text)",
                    background: active
                      ? "var(--color-primary-soft)"
                      : "transparent",
                  }}
                >
                  {link.label}
                </Link>
              );
            })}
          </div>
        </nav>
      </header>

      <nav className="mobile-bottom-nav" aria-label="Mobile navigation">
        {links.map((link) => {
          const active =
            pathname === link.href ||
            (link.href === "/jobs" &&
              pathname.startsWith("/jobs/") &&
              pathname !== "/jobs/new");

          return (
            <Link
              key={link.href}
              href={link.href}
              className="mobile-nav-link"
              aria-current={active ? "page" : undefined}
              style={{
                flex: 1,
                textAlign: "center",
                padding: "9px 3px 8px",
                textDecoration: "none",
                fontSize: 11,
                fontWeight: active ? 800 : 600,
                color: active
                  ? "var(--color-primary-action)"
                  : "var(--color-muted)",
              }}
            >
              {link.label}
            </Link>
          );
        })}
      </nav>
    </>
  );
}
