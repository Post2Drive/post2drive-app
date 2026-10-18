import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/lib/auth";
import { isTesterAdmin } from "@/lib/testerAdmin";
import QaCampaignBuilder from "./qa-campaign-builder";
import QaAdminAccessForm from "./admin-access-form";

export const dynamic = "force-dynamic";

export default async function QaCampaignsPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/api/auth/signin");
  const authorized = await isTesterAdmin();
  return <main style={{ maxWidth: 1180, margin: "0 auto", padding: "28px 20px" }}>
    <p style={{ color: "#667085", fontSize: 13, marginBottom: 6 }}>POST2DRIVE · QA & ENGINEERING</p>
    <h1 style={{ fontSize: 30, margin: "0 0 8px" }}>QA campaign builder</h1>
    {authorized ? <>
      <p style={{ color: "#667085", maxWidth: 760, lineHeight: 1.6 }}>Configure and save staging test plans, compare variations, and preserve campaign definitions. Saving is metadata-only: this page does not queue a run, create synthetic accounts, or change existing QA history.</p>
      <QaCampaignBuilder />
    </> : <>
      <p style={{ color: "#667085", maxWidth: 760, lineHeight: 1.6 }}>Your Post2Drive login is active. Verify your existing Ops Dashboard credentials to unlock the staging-only QA builder. This will not start a campaign.</p>
      <QaAdminAccessForm />
    </>}
  </main>;
}
