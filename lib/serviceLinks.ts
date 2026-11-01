export type ServiceIcon =
  | "home"
  | "marketplace"
  | "post"
  | "requirements"
  | "vehicles"
  | "payments"
  | "account"
  | "admin"
  | "qa";

export type ServiceLink = {
  href: string;
  label: string;
  hint: string;
  icon: ServiceIcon;
};

/**
 * Single source for the app's service tiles. Used by the Home tile grid and
 * the header Menu panel so both always open the same existing pages.
 */
export function getServiceLinks(
  country: string | null | undefined,
  { showQaCampaigns = false, showStudentPilot = false }: { showQaCampaigns?: boolean; showStudentPilot?: boolean } = {},
): ServiceLink[] {
  return [
    { href: "/dashboard", label: "Home", hint: "Overview and alerts", icon: "home" },
    { href: "/jobs", label: "Marketplace", hint: "Browse and accept loads", icon: "marketplace" },
    ...(country === "IN"
      ? [{ href: "/requirements", label: "My Requirements", hint: "What you need moved", icon: "requirements" as const }]
      : []),
    { href: "/jobs/new", label: "Post a Job", hint: "List a new load", icon: "post" },
    { href: "/vehicles", label: "Vehicles", hint: "Fleet and verification", icon: "vehicles" },
    { href: "/payments", label: "Payments", hint: "Earnings and history", icon: "payments" },
    { href: "/settings", label: "Account", hint: "Profile and settings", icon: "account" },
    { href: "/admin", label: "Admin", hint: "Operations tools", icon: "admin" },
    ...(showQaCampaigns ? [{ href: "/admin/qa-campaigns", label: "QA Campaigns", hint: "Tester campaigns", icon: "qa" as const }] : []),
    ...(showStudentPilot ? [{ href: "/admin/pilot", label: "UK Market QA", hint: "Student pilot", icon: "qa" as const }] : []),
  ];
}

export function isServiceActive(pathname: string, href: string) {
  return pathname === href ||
    (href === "/jobs" && pathname.startsWith("/jobs/") && pathname !== "/jobs/new");
}
