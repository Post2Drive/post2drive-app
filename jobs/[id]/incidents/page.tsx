import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import IncidentPanel from "./incident-panel";

export const dynamic = "force-dynamic";

export default async function JobIncidentsPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const accountId = (session.user as any)?.accountId;
  if (!accountId) redirect("/login");

  const job = await prisma.job.findUnique({
    where: { id },
    select: { id: true, posterId: true, acceptedById: true, pickup: true, dropoff: true, status: true },
  });
  if (!job) notFound();
  if (job.posterId !== accountId && job.acceptedById !== accountId) redirect("/dashboard");

  return (
    <main style={{ maxWidth: 900, margin: "0 auto", padding: "24px 16px 48px" }}>
      <p><Link href="/dashboard">← Dashboard</Link></p>
      <h1 style={{ fontSize: 30, marginBottom: 8 }}>Job incident and exception handling</h1>
      <p style={{ color: "var(--color-muted)" }}>Job {job.id} · {job.status.replaceAll("_", " ")} · {job.pickup} → {job.dropoff}</p>
      <p>Report breakdowns, health emergencies, incorrect or unsafe loads, delays, damage or disputes. Reports preserve the original job timeline and do not automatically cancel or reassign the job.</p>
      <IncidentPanel jobId={job.id} jobStatus={job.status} />
    </main>
  );
}
