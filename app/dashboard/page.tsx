import { getServerSession } from "next-auth";
import { redirect } from "next/navigation";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { getLocalisationProfile } from "@/lib/localisation";
import ServiceTiles from "@/components/service-tiles";
import LogoutTile from "@/components/logout-tile";
import { getServiceLinks } from "@/lib/serviceLinks";
import { isTesterAdmin } from "@/lib/testerAdmin";
import { isQaRunnerEnabled } from "@/lib/qaRunnerGuard";

/** Home: welcome line, then boxes only. Each box opens one section. */
export default async function DashboardPage() {
  const session = await getServerSession(authOptions);
  if (!session) redirect("/login");

  const accountId = (session.user as any)?.accountId;
  const account = await prisma.account.findUnique({
    where: { id: accountId },
    select: { country: true, currency: true, companyName: true, displayId: true },
  });
  if (!account) redirect("/login");

  const marketProfile = getLocalisationProfile({ country: account.country, currency: account.currency });
  const showQaCampaigns = await isTesterAdmin();
  const links = getServiceLinks(account.country, {
    showQaCampaigns,
    showStudentPilot: showQaCampaigns && isQaRunnerEnabled(),
  });

  return (
    <main className="ops-theme-dashboard service-home" data-market={account.country} data-currency={account.currency}>
      <header className="service-home-welcome">
        <h1>Welcome, {session.user?.name?.trim() || "there"}</h1>
        <p>
          {account.companyName?.trim() || "Your account"}
          {account.displayId ? ` · ${account.displayId}` : ""}
          {" · "}
          {marketProfile?.marketplaceLabel ?? account.country}
        </p>
      </header>

      <nav aria-label="Services">
        <ServiceTiles links={links}>
          <LogoutTile />
        </ServiceTiles>
      </nav>
    </main>
  );
}
