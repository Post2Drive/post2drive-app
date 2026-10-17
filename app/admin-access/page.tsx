import Link from "next/link";
import { redirect } from "next/navigation";

export const dynamic = "force-dynamic";

export default function AdminAccessPage() {
  const configured = process.env.OPS_DASHBOARD_URL;
  if (configured) {
    try {
      const url = new URL(configured);
      if (url.protocol === "https:") redirect(url.toString());
    } catch {
      // Do not redirect to malformed or insecure configured destinations.
    }
  }
  return <main style={{ minHeight: "calc(100vh - 64px)", display: "grid", placeItems: "center", padding: 24 }}>
    <section style={{ maxWidth: 560, width: "100%", padding: 28, border: "1px solid var(--color-border)", borderRadius: 16, background: "var(--color-surface)" }}>
      <p style={{ color: "var(--color-muted)", fontWeight: 700, letterSpacing: ".12em", fontSize: 12 }}>POST2DRIVE · ADMIN ACCESS</p>
      <h1>Analytics dashboard</h1>
      <p>The administrator dashboard is a separate, dashboard-only service. It does not use customer accounts and cannot access marketplace pages.</p>
      <p>Admin access is not configured for this deployment yet. An authorised project member must set <code>OPS_DASHBOARD_URL</code> to the HTTPS URL of the separate dashboard service and provision its admin credentials as Railway secrets.</p>
      <p><Link href="/">Return to Post2Drive</Link></p>
    </section>
  </main>;
}
