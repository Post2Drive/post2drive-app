"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useSession } from "next-auth/react";

/**
 * Boxes-only navigation: Home is the box grid. Every other signed-in page
 * shows nothing above its content except one way back to Home.
 */
export default function MainNav(_props: { showQaCampaigns?: boolean; showStudentPilot?: boolean }) {
  const pathname = usePathname();
  const { status } = useSession();

  if (status !== "authenticated" || pathname === "/dashboard") return null;

  return (
    <nav className="back-home-bar" aria-label="Main navigation">
      <Link href="/dashboard" className="back-home-link">
        <span aria-hidden="true">←</span> Home
      </Link>
    </nav>
  );
}
