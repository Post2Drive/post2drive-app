"use client";

import { signOut } from "next-auth/react";

export default function SignOutButton() {
  return <button type="button" className="button-link button-link-secondary" onClick={() => signOut({ callbackUrl: "/login" })}>Log out</button>;
}
