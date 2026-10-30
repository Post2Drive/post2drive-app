"use client";

import { signOut } from "next-auth/react";

const dashboardActionStyle: React.CSSProperties = {
  color: "#FFFFFF",
  backgroundColor: "#2457D6",
  borderColor: "#2457D6",
  fontWeight: 750,
};

export default function SignOutButton() {
  return <button className="dashboard-action-button primary" style={dashboardActionStyle} onClick={() => signOut({ callbackUrl: "/login" })}>Log out</button>;
}
