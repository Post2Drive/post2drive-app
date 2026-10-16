import { redirect } from "next/navigation";
import Link from "next/link";
import { isTesterAdmin } from "@/lib/testerAdmin";
import PerformanceDashboard from "./performance-dashboard";

export const dynamic = "force-dynamic";

export default async function AdminPerformancePage() {
  if (!(await isTesterAdmin())) redirect("/dashboard");
  return (
    <main style={{ maxWidth: 1440, margin: "0 auto", padding: "20px 16px 48px" }}>
      <p style={{ marginTop: 0, marginBottom: 12 }}><Link href="/dashboard">← Dashboard</Link> · <Link href="/admin/testers">Tester applications</Link></p>
      <h1 style={{ fontSize: 30, lineHeight: 1.15, margin: "0 0 8px" }}>Platform performance</h1>
      <p style={{ color: "var(--color-muted)", maxWidth: 850, marginTop: 0 }}>Live account, marketplace, activity and backend metrics. Synthetic test accounts are excluded from business totals; API timing starts collecting after this release is deployed.</p>
      <PerformanceDashboard />
    </main>
  );
}
