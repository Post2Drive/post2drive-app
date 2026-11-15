import Link from "next/link";
import { redirect, notFound } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { rulesForAccount } from "@/lib/marketRules";
import { proofEnforcementOn } from "@/lib/proofRequirement";
import { DISPUTE_REASON_LABELS, isDisputeReason } from "@/lib/disputes";
import { JOB_STATUS_LABELS } from "@/lib/jobState";
import ProofPanel, { type DisputeSummary, type ProofPhotoView } from "./proof-panel";

export const dynamic = "force-dynamic";

export default async function JobProofPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  const accountId = (session.user as any)?.accountId;
  if (!accountId) redirect("/login");

  const job = await prisma.job.findUnique({
    where: { id },
    select: {
      id: true, status: true, pickup: true, dropoff: true, posterId: true, acceptedById: true,
      poster: { select: { country: true, currency: true } },
    },
  });
  if (!job) notFound();
  if (job.posterId !== accountId && job.acceptedById !== accountId) redirect("/dashboard");
  const role = job.posterId === accountId ? "poster" : "driver";

  const rows = await prisma.jobProofPhoto.findMany({
    where: { jobId: id, OR: [{ expiresAt: { gt: new Date() } }, { job: { status: "disputed" } }] },
    orderBy: { createdAt: "asc" },
    select: { id: true, stage: true, width: true, height: true, createdAt: true, uploadedById: true },
    take: 20,
  });
  const photos: ProofPhotoView[] = rows.map((row) => ({
    id: row.id,
    stage: row.stage as "pickup" | "delivery",
    width: row.width,
    height: row.height,
    createdAt: row.createdAt.toISOString(),
    by: row.uploadedById === job.posterId ? "poster" : "driver",
    mine: row.uploadedById === accountId,
  }));

  let dispute: DisputeSummary | null = null;
  if (job.status === "disputed") {
    const opened = await prisma.jobActivity.findFirst({
      where: { jobId: id, action: "DISPUTE_OPENED" },
      orderBy: { createdAt: "desc" },
      select: { createdAt: true, metadata: true },
    });
    const meta = (opened?.metadata ?? {}) as { reason?: unknown; notes?: unknown; openedByRole?: unknown; automatic?: unknown };
    dispute = {
      reasonLabel: isDisputeReason(meta.reason) ? DISPUTE_REASON_LABELS[meta.reason] : "Under review",
      notes: typeof meta.notes === "string" ? meta.notes : "",
      openedByRole: meta.openedByRole === "poster" ? "poster" : "driver",
      automatic: meta.automatic === true,
      openedAt: opened?.createdAt.toISOString() ?? null,
    };
  }

  const photosRequired = proofEnforcementOn() && rulesForAccount(job.poster).proofPhotosRequired;

  return (
    <main style={{ maxWidth: 900, margin: "0 auto", padding: "24px 16px 48px" }}>
      <p><Link href="/jobs">← Jobs</Link></p>
      <h1 style={{ fontSize: 30, marginBottom: 8 }}>Photos and problems</h1>
      <p style={{ color: "var(--color-muted)" }}>
        {JOB_STATUS_LABELS[job.status as keyof typeof JOB_STATUS_LABELS] ?? job.status.replaceAll("_", " ")} · {job.pickup} → {job.dropoff}
      </p>
      <ProofPanel
        jobId={job.id}
        status={job.status}
        role={role}
        photosRequired={photosRequired}
        initialPhotos={photos}
        dispute={dispute}
      />
    </main>
  );
}
