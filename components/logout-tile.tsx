"use client";

import { signOut } from "next-auth/react";
import { ServiceTileIcon } from "@/components/service-tiles";

export default function LogoutTile() {
  return (
    <li>
      <button
        type="button"
        className="service-tile service-tile-button"
        onClick={() => signOut({ callbackUrl: "/login" })}
      >
        <ServiceTileIcon icon="logout" />
        <span className="service-tile-label">Log out</span>
        <span className="service-tile-hint">Sign out of this device</span>
      </button>
    </li>
  );
}
