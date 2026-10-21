import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

export const dynamic = "force-dynamic";

export default async function RequirementsPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user) redirect("/login");
  const accountId = (session.user as any).accountId as string | undefined;
  if (!accountId) redirect("/login");

  const account = await prisma.account.findUnique({
    where: { id: accountId },
    select: { country: true, currency: true, deletionRequestedAt: true },
  });
  if (!account || account.deletionRequestedAt) redirect("/login");
  if (account.country !== "IN" || account.currency !== "INR") redirect("/jobs");

  const jobs = await prisma.job.findMany({
    where: { posterId: accountId, currency: "INR", crossBorder: false },
    orderBy: [{ createdAt: "desc" }],
    select: { id: true, pickup: true, dropoff: true, jobDate: true, pickupTime: true, vehicleType: true, price: true, priceMode: true, status: true, createdAt: true },
  });

  const indianDate = (date: Date) => new Intl.DateTimeFormat("en-IN", { timeZone: "Asia/Kolkata", day: "2-digit", month: "short", year: "numeric" }).format(date);
  return <main style={{ maxWidth: 1050, margin: "0 auto", padding: "28px 16px 56px" }}>
    <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", flexWrap: "wrap", gap: 12 }}>
      <div><p style={{ color: "var(--color-positive)", fontWeight: 800, letterSpacing: ".08em", fontSize: 12 }}>INDIA MARKETPLACE · INR</p><h1 style={{ margin: "4px 0 8px" }}>My Requirements</h1><p style={{ color: "var(--color-muted)", marginTop: 0 }}>Manage the delivery jobs your business has posted in India.</p></div>
      <Link className="button-link" href="/jobs/new">+ Post a requirement</Link>
    </div>
    {jobs.length === 0 ? <section style={{ border: "1px solid var(--color-border)", borderRadius: 12, padding: 24, background: "var(--color-surface)", marginTop: 22 }}><h2>No requirements yet</h2><p>Post your first delivery requirement to connect with drivers in the India marketplace.</p><Link className="button-link" href="/jobs/new">Post your first requirement</Link></section> : <div role="region" aria-label="Posted requirements" style={{ display: "grid", gap: 12, marginTop: 20 }}>
      {jobs.map((job) => {
        const routeLabel = `${job.pickup} to ${job.dropoff}`;
        const statusLabel = job.status.replaceAll("_", " ");
        return <article key={job.id} style={{ border: "1px solid var(--color-border)", borderRadius: 12, padding: 18, background: "var(--color-surface)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", gap: 12, flexWrap: "wrap" }}><div><h2 style={{ fontSize: 18, margin: "0 0 8px" }}>{job.pickup} → {job.dropoff}</h2><p style={{ margin: 0, color: "var(--color-muted)" }}>{indianDate(job.jobDate)}{job.pickupTime ? ` · ${job.pickupTime} IST` : ""} · {job.vehicleType}</p></div><span style={{ padding: "5px 9px", borderRadius: 999, background: job.status === "open" ? "var(--color-positive-soft)" : "var(--color-primary-soft)", textTransform: "capitalize", fontWeight: 750, fontSize: 12 }}>Status: {statusLabel}</span></div>
          <p style={{ marginBottom: 0, fontWeight: 750 }}>{job.priceMode === "bid" ? `Guide price ₹${job.price.toLocaleString("en-IN")} · Open to bids` : `₹${job.price.toLocaleString("en-IN")} · Fixed price`}</p>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", marginTop: 14 }}><Link aria-label={`Edit requirement: ${routeLabel}`} className="button-link button-link-secondary" href={`/jobs/${job.id}/edit`}>Edit requirement</Link><Link aria-label={`View in marketplace: ${routeLabel}`} className="button-link button-link-secondary" href={`/jobs#${job.id}`}>View in marketplace</Link><Link aria-label={`Incident history: ${routeLabel}`} className="button-link button-link-secondary" href={`/jobs/${job.id}/incidents`}>Incident history</Link></div>
        </article>;
      })}
    </div>}
  </main>;
}
