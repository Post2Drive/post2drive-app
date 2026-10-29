import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { isTesterAdmin } from "@/lib/testerAdmin";
import { isQaRunnerEnabled } from "@/lib/qaRunnerGuard";
import { prisma } from "@/lib/prisma";
import PilotCodeGenerator from "./PilotCodeGenerator";

export const dynamic = "force-dynamic";

function record(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Record<string, unknown> : {};
}

function shortDevice(value: unknown) {
  const d = record(value);
  const view = `${d.viewportWidth ?? "?"}×${d.viewportHeight ?? "?"}`;
  const screen = `${d.screenWidth ?? "?"}×${d.screenHeight ?? "?"}`;
  const overflow = Number(d.horizontalOverflowPx ?? 0);
  return `Viewport ${view}px · screen ${screen}px · DPR ${d.devicePixelRatio ?? "?"} · ${d.orientation ?? "?"} · overflow ${overflow}px · ${d.nativeShell ? "native shell" : d.standalone ? "standalone web app" : "browser"}`;
}

export default async function StudentPilotAdminPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  if (!(await isTesterAdmin()) || !isQaRunnerEnabled()) redirect("/dashboard");

  const rows = await prisma.adminAuditEvent.findMany({
    where: { action: "pilot_feedback_submitted", entityType: "pilot_feedback", market: "GB" },
    orderBy: { createdAt: "desc" },
    take: 200,
    select: { id: true, actor: true, createdAt: true, details: true },
  });

  return (
    <main style={{ width: "100%", maxWidth: 1180, boxSizing: "border-box", margin: "0 auto", padding: "24px 16px 80px" }}>
      <p><a className="button-link button-link-secondary" href="/dashboard">← Back to dashboard</a></p>
      <h1>UK-market QA cohort</h1>
      <p>This admin-only page is available only when the staging QA safety gate is active. Use individual codes for Indian student volunteers testing the GB/GBP market configuration. This is separate from the UK commercial launch pilot and does not simulate physical UK location, network conditions or local compliance. Never use tester accounts for real deliveries.</p>
      <PilotCodeGenerator />
      <h2>Latest QA feedback</h2>
      <p>Feedback is stored against the tester account's public display ID. It includes only the allow-listed diagnostics shown to the student at submission; no screenshot, password, email address or document image is uploaded by this form.</p>
      {rows.length === 0 ? <p>No feedback submitted yet.</p> : (
        <div style={{ overflowX: "auto", border: "1px solid var(--color-border)", borderRadius: 10 }}>
          <table style={{ borderCollapse: "collapse", width: "100%", minWidth: 900 }}>
            <thead><tr>{["Submitted (UK time)", "Tester account", "Area", "Impact", "Report", "Device / layout", "Full diagnostics"].map(label => <th key={label} style={{ textAlign: "left", padding: 10, borderBottom: "1px solid var(--color-border)" }}>{label}</th>)}</tr></thead>
            <tbody>
              {rows.map(row => {
                const d = record(row.details);
                return <tr key={row.id}>
                  <td style={{ padding: 10, verticalAlign: "top", whiteSpace: "nowrap" }}>{new Date(row.createdAt).toLocaleString("en-GB", { timeZone: "Europe/London" })}</td>
                  <td style={{ padding: 10, verticalAlign: "top" }}>{row.actor.replace(/^pilot:/, "")}</td>
                  <td style={{ padding: 10, verticalAlign: "top" }}>{String(d.category ?? "—")}</td>
                  <td style={{ padding: 10, verticalAlign: "top" }}>{String(d.severity ?? "—")}</td>
                  <td style={{ padding: 10, verticalAlign: "top", minWidth: 220 }}><strong>{String(d.title ?? "—")}</strong><p style={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{String(d.description ?? "—")}</p></td>
                  <td style={{ padding: 10, verticalAlign: "top", minWidth: 260 }}>{shortDevice(d.diagnostics)}</td>
                  <td style={{ padding: 10, verticalAlign: "top" }}><details><summary>View</summary><pre style={{ maxWidth: 360, whiteSpace: "pre-wrap", overflowWrap: "anywhere", fontSize: 12 }}>{JSON.stringify(d.diagnostics ?? {}, null, 2)}</pre></details></td>
                </tr>;
              })}
            </tbody>
          </table>
        </div>
      )}
      <p style={{ marginTop: 20 }}>For a visual layout defect, ask the student for a screenshot separately through your agreed private channel. This app does not silently take or upload screenshots.</p>
    </main>
  );
}
