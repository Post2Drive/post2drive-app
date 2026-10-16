import Link from "next/link";
import { redirect } from "next/navigation";
import { isTesterAdmin } from "@/lib/testerAdmin";

const item = { border: "1px solid var(--color-border, #dfe5eb)", borderRadius: 12, padding: 20, textDecoration: "none", color: "inherit", display: "block" as const };

export default async function AdminHomePage() {
  if (!(await isTesterAdmin())) redirect("/dashboard");
  return <main style={{ maxWidth: 1000, margin: "0 auto", padding: "24px 16px 48px" }}>
    <p><Link href="/dashboard">← Dashboard</Link></p>
    <h1 style={{ fontSize: 30, marginBottom: 8 }}>Administration</h1>
    <p style={{ color: "var(--color-muted)", maxWidth: 760 }}>Private platform controls and operational reporting. Access is limited to the administrator email allowlist in the deployment environment.</p>
    <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit,minmax(min(100%,300px),1fr))", gap: 14, marginTop: 24 }}>
      <Link href="/admin/performance" style={item}>
        <h2 style={{ marginTop: 0, fontSize: 20 }}>Performance & activity</h2>
        <p style={{ color: "var(--color-muted)" }}>User growth, account and job activity, API latency, error rates, vehicle compliance snapshots and QA test reports.</p>
        <strong>Open performance dashboard →</strong>
      </Link>
      <Link href="/admin/testers" style={item}>
        <h2 style={{ marginTop: 0, fontSize: 20 }}>Tester applications</h2>
        <p style={{ color: "var(--color-muted)" }}>Review private tester applications, check their submitted vehicles and manage individual invite codes.</p>
        <strong>Manage testers →</strong>
      </Link>
      <Link href="/admin/research" style={item}>
        <h2 style={{ marginTop: 0, fontSize: 20 }}>India market research</h2>
        <p style={{ color: "var(--color-muted)" }}>Aggregate optional market-survey answers to prioritise the India marketplace. Account-level research is excluded when deletion is requested.</p>
        <strong>Open research dashboard →</strong>
      </Link>
      <Link href="/admin/incidents" style={item}>
        <h2 style={{ marginTop: 0, fontSize: 20 }}>Incident and exception review</h2>
        <p style={{ color: "var(--color-muted)" }}>Review reported breakdowns, wrong loads, safety incidents, delivery damage and disputes; record decisions and notify the parties.</p>
        <strong>Review incidents →</strong>
      </Link>
    </div>
  </main>;
}
