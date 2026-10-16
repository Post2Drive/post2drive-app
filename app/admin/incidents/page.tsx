import Link from "next/link";
import { redirect } from "next/navigation";
import { isTesterAdmin } from "@/lib/testerAdmin";
import IncidentReview from "./incident-review";

export const dynamic = "force-dynamic";

export default async function AdminIncidentsPage() {
  if (!(await isTesterAdmin())) redirect("/dashboard");
  return (
    <main style={{ maxWidth: 1100, margin: "0 auto", padding: "24px 16px 48px" }}>
      <p><Link href="/admin">← Administration</Link> · <Link href="/admin/performance">Performance dashboard</Link></p>
      <h1 style={{ fontSize: 30 }}>Incident and exception review</h1>
      <p>Review reported exceptions, record a reasoned decision, and notify the involved parties. This does not automatically execute a vehicle recovery, reassignment, goods return, payment adjustment or job status change.</p>
      <IncidentReview />
    </main>
  );
}
