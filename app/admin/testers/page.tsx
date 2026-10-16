import { redirect } from "next/navigation";
import Link from "next/link";
import { isTesterAdmin } from "@/lib/testerAdmin";
import TesterReview from "./tester-review";

export default async function AdminTestersPage() {
  if (!(await isTesterAdmin())) redirect("/dashboard");
  return <main style={{ maxWidth: 1000, margin: "0 auto", padding: 24 }}>
    <p><Link href="/dashboard">← Dashboard</Link> · <Link href="/admin/performance">Performance dashboard</Link></p>
    <h1>Tester applications</h1>
    <p>Only administrator email addresses configured in Railway can access this page.</p>
    <TesterReview />
  </main>;
}
