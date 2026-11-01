export type ServiceIcon =
  | "home"
  | "marketplace"
  | "post"
  | "requirements"
  | "vehicles"
  | "payments"
  | "account"
  | "admin"
  | "qa"
  | "overview"
  | "notifications"
  | "logout";

export type ServiceLink = {
  href: string;
  label: string;
  hint: string;
  icon: ServiceIcon;
};

/**
 * Single source for the Home service boxes; each opens one existing section.
 */
export function getServiceLinks(
  country: string | null | undefined,
  { showQaCampaigns = false, showStudentPilot = false }: { showQaCampaigns?: boolean; showStudentPilot?: boolean } = {},
): ServiceLink[] {
  return [
    { href: "/jobs", label: "Marketplace", hint: "Browse and accept loads", icon: "marketplace" },
    ...(country === "IN"
      ? [{ href: "/requirements", label: "My Requirements", hint: "What you need moved", icon: "requirements" as const }]
      : []),
    { href: "/jobs/new", label: "Post a Job", hint: "List a new load", icon: "post" },
    { href: "/vehicles", label: "Vehicles", hint: "Fleet and verification", icon: "vehicles" },
    { href: "/payments", label: "Payments", hint: "Earnings and history", icon: "payments" },
    { href: "/dashboard/overview", label: "Overview", hint: "Stats, charts and plan", icon: "overview" },
    { href: "/notifications", label: "Notifications", hint: "Updates on your jobs", icon: "notifications" },
    { href: "/settings", label: "Account", hint: "Profile and settings", icon: "account" },
    ...(showQaCampaigns ? [{ href: "/admin", label: "Admin", hint: "Operations tools", icon: "admin" as const }] : []),
    ...(showQaCampaigns ? [{ href: "/admin/qa-campaigns", label: "QA Campaigns", hint: "Tester campaigns", icon: "qa" as const }] : []),
    ...(showStudentPilot ? [{ href: "/admin/pilot", label: "UK Market QA", hint: "Student pilot", icon: "qa" as const }] : []),
  ];
}
