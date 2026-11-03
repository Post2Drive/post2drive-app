import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Log in – Post2Drive",
  description: "Sign in to your Post2Drive account to manage deliveries, bids, and your driver or business profile.",
  robots: { index: false, follow: false },
};

export default function LoginLayout({ children }: { children: React.ReactNode }) {
  return children;
}
