import Link from "next/link";
import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";

function Status({ value }: { value: string }) {
  return <strong>{value.replaceAll("_", " ")}</strong>;
}

export default async function VerificationPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");
  const accountId = (session.user as any)?.accountId as string | undefined;
  const userId = (session.user as any)?.id as string | undefined;
  if (!accountId || !userId) redirect("/login");

  const [account, user, vehicles] = await Promise.all([
    prisma.account.findUnique({
      where: { id: accountId, deletionRequestedAt: null },
      select: { verificationStatus: true, companyVerificationStatus: true, companyVerificationSubmittedAt: true },
    }),
    prisma.user.findUnique({
      where: { id: userId },
      select: { email: true, emailVerifiedAt: true, phone: true },
    }),
    prisma.vehicle.findMany({
      where: { accountId },
      select: { id: true, vehicleType: true, verificationStatus: true },
      orderBy: { createdAt: "desc" },
    }),
  ]);
  if (!account || !user) redirect("/login");

  const verifiedVehicles = vehicles.filter((vehicle) => vehicle.verificationStatus === "verified");
  const postingReady = account.verificationStatus === "verified" && account.companyVerificationStatus === "verified";
  const carrierReady = account.verificationStatus === "verified" && verifiedVehicles.length > 0;

  return (
    <main style={{ maxWidth: 960, margin: "0 auto", padding: "24px 16px 64px" }}>
      <p><Link href="/dashboard">← Dashboard</Link></p>
      <h1>Verification centre</h1>
      <p>One Post2Drive account for posting work and carrying deliveries. Complete the checks that apply to your business and each vehicle.</p>
      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(min(100%, 260px), 1fr))", gap: 16 }}>
        <section className="dashboard-stat-card" aria-labelledby="account-verification-heading">
          <h2 id="account-verification-heading">1. Email and account</h2>
          <p>Email: <Status value={user.emailVerifiedAt ? "verified" : "pending"} /></p>
          <p>Account verification: <Status value={account.verificationStatus} /></p>
          <p>Phone on file: {user.phone}</p>
          <p>SMS phone verification is not configured in this deployment. A phone number on file is not proof of phone ownership.</p>
          <p>{user.email}</p>
        </section>
        <section className="dashboard-stat-card" aria-labelledby="business-verification-heading">
          <h2 id="business-verification-heading">2. Business / posting</h2>
          <p>Business review: <Status value={account.companyVerificationStatus} /></p>
          {account.companyVerificationSubmittedAt && <p>Submitted: {new Date(account.companyVerificationSubmittedAt).toISOString().slice(0, 10)}</p>}
          <p>{postingReady ? "Job posting checks are complete." : "Complete account verification and submit your business details for review."}</p>
          <Link className="button-link" href="/settings">Review business details</Link>
        </section>
        <section className="dashboard-stat-card" aria-labelledby="vehicle-verification-heading">
          <h2 id="vehicle-verification-heading">3. Vehicles / carrying</h2>
          <p>{verifiedVehicles.length} of {vehicles.length} vehicles verified</p>
          {vehicles.length === 0 ? <p>No vehicles registered yet.</p> : (
            <ul>{vehicles.map((vehicle) => <li key={vehicle.id}>{vehicle.vehicleType} — <Status value={vehicle.verificationStatus} /></li>)}</ul>
          )}
          <p>{carrierReady ? "At least one vehicle is approved. Eligibility is checked against each job's requirements and document expiry." : "Add a vehicle and complete its review before bidding or accepting jobs."}</p>
          <Link className="button-link" href="/vehicles">Manage vehicles</Link>
        </section>
      </div>
      <p>Verification is checked again by the server when posting, bidding, accepting or awarding a job. A visible status alone never grants access.</p>
    </main>
  );
}
