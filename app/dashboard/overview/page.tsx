import { getServerSession } from "next-auth";
import SubscriptionStatus from "@/components/subscription-status";
import PlanSwitchControl from "@/components/plan-switch-control";
import { redirect } from "next/navigation";
import Link from "next/link";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatMarketCurrency, formatMarketDate, getLocalisationProfile } from "@/lib/localisation";
import { getEntitlementStatus } from "@/lib/access";
import {
  getPlanDisplay,
} from "@/lib/pricing";
import {
  isUkAccount,
} from "@/lib/uk";
import { isWeeklyPricingEligible } from "@/lib/pricing";
import { subscriptionCheckoutConnected } from "@/lib/paymentProvider";



function StatCard({
  title,
  value,
  href,
}: {
  title: string;
  value: number | string;
  href?: string;
}) {
  const content = (
    <div className="dashboard-stat-card ops-theme-card">
      <div
        style={{
          fontSize: 13,
          color: "var(--color-muted)",
          marginBottom: 8,
        }}
      >
        {title}
      </div>

      <div
        style={{
          fontSize: 28,
          fontWeight: 700,
        }}
      >
        {value}
      </div>
    </div>
  );

  if (href) {
    return (
      <Link
        href={href}
        className="dashboard-stat-link"
      >
        {content}
      </Link>
    );
  }

  return content;
}

export default async function DashboardOverviewPage() {
  const checkoutConnected = subscriptionCheckoutConnected();
  const session =
    await getServerSession(
      authOptions
    );

  if (!session) {
    redirect("/login");
  }

  const accountId =
    (session.user as any)?.accountId;

  const account =
    await prisma.account.findUnique({
      where: {
        id: accountId,
      },
    });

  if (!account) {
    redirect("/login");
  }

  const marketProfile = getLocalisationProfile({ country: account.country, currency: account.currency });
  const ukEligible =
    isUkAccount(account);
  const weeklyPricingEligible = isWeeklyPricingEligible(account);

  // Launch windows, separate POST/DRIVE entitlements, waitlist and billing (EXECUTION_PLAN §3–§4).
  const entitlementStatus =
    weeklyPricingEligible
      ? await getEntitlementStatus(account.id)
      : null;
  const billingPlan = entitlementStatus?.billing?.plan;

  const planKey =
    billingPlan === "poster" || billingPlan === "individual" || billingPlan === "fleet"
      ? billingPlan
      : account.planType === "fleet"
      ? "fleet"
      : "individual";

  const plan =
    getPlanDisplay(
      planKey,
      account
    );

  const [
    postedOpen,
    postedAccepted,
    postedInTransit,
    postedDelivered,
    postedCompleted,
    postedCancelled,
    acceptedJobs,
    acceptedInTransit,
    acceptedDelivered,
    acceptedCompleted,
  ] = await Promise.all([
    prisma.job.count({
      where: {
        posterId: account.id,
        status: "open",
      },
    }),

    prisma.job.count({
      where: {
        posterId: account.id,
        status: "accepted",
      },
    }),

    prisma.job.count({
      where: {
        posterId: account.id,
        status: "in_transit",
      },
    }),

    prisma.job.count({
      where: {
        posterId: account.id,
        status: "delivered",
      },
    }),

    prisma.job.count({
      where: {
        posterId: account.id,
        status: "completed",
      },
    }),

    prisma.job.count({
      where: {
        posterId: account.id,
        status: "cancelled",
      },
    }),

    prisma.job.count({
      where: {
        acceptedById: account.id,
      },
    }),

    prisma.job.count({
      where: {
        acceptedById: account.id,
        status: "in_transit",
      },
    }),

    prisma.job.count({
      where: {
        acceptedById: account.id,
        status: "delivered",
      },
    }),

    prisma.job.count({
      where: {
        acceptedById: account.id,
        status: "completed",
      },
    }),
  ]);

  const totalPosted =
    postedOpen +
    postedAccepted +
    postedInTransit +
    postedDelivered +
    postedCompleted +
    postedCancelled;

  const activePosted =
    postedOpen +
    postedAccepted +
    postedInTransit +
    postedDelivered;

  const activeDriverJobs =
    acceptedInTransit +
    acceptedDelivered;

  return (
    <main
      className="ops-theme-dashboard" data-market={account.country} data-currency={account.currency}
      style={{
        maxWidth: 1200,
        margin: "0 auto",
        padding: "28px 20px 60px",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent:
            "space-between",
          alignItems: "center",
          gap: 16,
          flexWrap: "wrap",
        }}
      >
        <div>
          <h1
            style={{
              marginBottom: 6,
            }}
          >
            Overview
          </h1>

          <p
            style={{
              marginTop: 0,
              color: "var(--color-muted)",
            }}
          >
            {account.planType === "fleet"
              ? "Fleet plan"
              : "Individual plan"}{" "}
            · {marketProfile?.marketplaceLabel ?? account.country} ·{" "}
            {account.currency}
          </p>
        </div>
      </div>


      <section
        className="ops-section ops-section-overview"
        style={{
          marginTop: 28,
        }}
      >
        <h2>
          Operations overview
        </h2>

        <div className="dashboard-stat-grid">
          <StatCard
            title="Jobs posted"
            value={totalPosted}
            href="/jobs"
          />

          <StatCard
            title="Open jobs"
            value={postedOpen}
            href="/jobs"
          />

          <StatCard
            title="Active posted"
            value={activePosted}
            href="/jobs"
          />

          <StatCard
            title="Completed posted"
            value={postedCompleted}
            href="/jobs"
          />

          <StatCard
            title="Cancelled posted"
            value={postedCancelled}
            href="/jobs"
          />

          <StatCard
            title="Jobs accepted"
            value={acceptedJobs}
            href="/jobs"
          />

          <StatCard
            title="Active fulfilment"
            value={activeDriverJobs}
            href="/jobs"
          />

          <StatCard
            title="Jobs completed"
            value={acceptedCompleted}
            href="/jobs"
          />
        </div>
      </section>

      <section
        className="ops-section ops-section-pipeline"
        style={{
          marginTop: 28,
          border: "1px solid var(--color-border)",
          borderRadius: 12,
          padding: 20,
        }}
      >
        <h2>
          Job pipeline
        </h2>

        <div
          style={{
            display: "grid",
            gridTemplateColumns:
              "repeat(auto-fit, minmax(140px, 1fr))",
            gap: 12,
            marginTop: 14,
          }}
        >
          <div>
            <strong>
              {postedOpen}
            </strong>
            <div>
              Open
            </div>
          </div>

          <div>
            <strong>
              {postedAccepted}
            </strong>
            <div>
              Accepted
            </div>
          </div>

          <div>
            <strong>
              {postedInTransit}
            </strong>
            <div>
              In transit
            </div>
          </div>

          <div>
            <strong>
              {postedDelivered}
            </strong>
            <div>
              Delivered
            </div>
          </div>

          <div>
            <strong>
              {postedCompleted}
            </strong>
            <div>
              Completed
            </div>
          </div>

          <div>
            <strong>
              {postedCancelled}
            </strong>
            <div>
              Cancelled
            </div>
          </div>
        </div>
      </section>

      <section className="ops-section ops-section-visual-analytics" aria-labelledby="job-analytics-heading" style={{ marginTop: 28, border: "1px solid #D5D9E0", borderRadius: 14, padding: 20, background: "#FFFFFF" }}>
        <h2 id="job-analytics-heading">Job analytics</h2>
        <p style={{ color: "#30343B", marginTop: 0 }}>Live breakdown of jobs you have posted. Counts reflect your current account and market.</p>
        {totalPosted > 0 ? (
          <div className="job-analytics-layout">
            <div className="job-analytics-chart-panel">
              <h3>Status distribution</h3>
              <div className="job-donut-row">
                <div role="img" aria-label={`Donut chart: ${postedOpen} open, ${postedAccepted} accepted, ${postedInTransit} in transit, ${postedDelivered} delivered, ${postedCompleted} completed, ${postedCancelled} cancelled jobs`} className="job-status-donut" style={{ /* taste-skill-ignore: donut chart drawn from real job counts */ background: `conic-gradient(#0057D9 0% ${postedOpen / totalPosted * 100}%, #6F2DBD ${postedOpen / totalPosted * 100}% ${(postedOpen + postedAccepted) / totalPosted * 100}%, #F06A00 ${(postedOpen + postedAccepted) / totalPosted * 100}% ${(postedOpen + postedAccepted + postedInTransit) / totalPosted * 100}%, #008A45 ${(postedOpen + postedAccepted + postedInTransit) / totalPosted * 100}% ${(postedOpen + postedAccepted + postedInTransit + postedDelivered) / totalPosted * 100}%, #178A45 ${(postedOpen + postedAccepted + postedInTransit + postedDelivered) / totalPosted * 100}% ${(postedOpen + postedAccepted + postedInTransit + postedDelivered + postedCompleted) / totalPosted * 100}%, #D71920 ${(postedOpen + postedAccepted + postedInTransit + postedDelivered + postedCompleted) / totalPosted * 100}% 100%)` }}>
                  <div className="job-status-donut-hole"><strong>{totalPosted}</strong><span>Total jobs</span></div>
                </div>
                <div className="job-chart-legend">
                  {[
                    { label: "Open", value: postedOpen, color: "#0057D9" },
                    { label: "Accepted", value: postedAccepted, color: "#6F2DBD" },
                    { label: "In transit", value: postedInTransit, color: "#F06A00" },
                    { label: "Delivered", value: postedDelivered, color: "#008A45" },
                    { label: "Completed", value: postedCompleted, color: "#178A45" },
                    { label: "Cancelled", value: postedCancelled, color: "#D71920" },
                  ].map((item) => (
                    <div key={item.label} className="job-chart-legend-item">
                      <span aria-hidden="true" className="job-chart-legend-dot" style={{ background: item.color }} />
                      <span>{item.label}</span><strong>{item.value}</strong>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <div className="job-analytics-chart-panel">
              <h3>Jobs by status</h3>
              <div className="job-horizontal-bars">
                {[
                  { label: "Open", value: postedOpen, color: "#0057D9" },
                  { label: "Accepted", value: postedAccepted, color: "#6F2DBD" },
                  { label: "In transit", value: postedInTransit, color: "#F06A00" },
                  { label: "Delivered", value: postedDelivered, color: "#008A45" },
                  { label: "Completed", value: postedCompleted, color: "#178A45" },
                  { label: "Cancelled", value: postedCancelled, color: "#D71920" },
                ].map((item) => (
                  <div className="job-bar-row" key={item.label}>
                    <div className="job-bar-label"><span>{item.label}</span><strong>{item.value}</strong></div>
                    <div className="job-bar-track" role="img" aria-label={`${item.label}: ${item.value} jobs`}>
                      <span style={{ width: `${item.value / totalPosted * 100}%`, background: item.color }} />
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        ) : (
          <div className="job-analytics-empty"><strong>No job data to chart yet.</strong><span>Your charts will populate automatically when you post jobs.</span></div>
        )}
        <div className="job-pipeline-visual" role="group" aria-label="Job status distribution chart">
          <h3>Job status distribution</h3>
          <div className="pipeline-chart-rows">
            {[
              { label: "Open", value: postedOpen, color: "#2457D6" },
              { label: "Accepted", value: postedAccepted, color: "#6D28D9" },
              { label: "In transit", value: postedInTransit, color: "#E87500" },
              { label: "Delivered", value: postedDelivered, color: "#18864B" },
              { label: "Completed", value: postedCompleted, color: "#18864B" },
              { label: "Cancelled", value: postedCancelled, color: "#D62828" },
            ].map((item) => (
              <div className="pipeline-chart-row" key={item.label}>
                <span>{item.label}</span>
                <div className="pipeline-chart-track" role="img" aria-label={`${item.label}: ${item.value}`}>
                  <div className="pipeline-chart-bar" style={{ width: `${totalPosted > 0 ? (item.value / totalPosted) * 100 : 0}%`, backgroundColor: item.color }} />
                </div>
                <strong>{item.value}</strong>
              </div>
            ))}
          </div>
          <div className="pipeline-donut-row">
            <div className="pipeline-donut" role="img" aria-label={`Job status distribution: ${totalPosted} total jobs`} style={{ /* taste-skill-ignore: donut chart drawn from real job counts */ background: `conic-gradient(#2457D6 0% ${totalPosted ? (postedOpen / totalPosted) * 100 : 0}%, #6D28D9 ${totalPosted ? (postedOpen / totalPosted) * 100 : 0}% ${totalPosted ? ((postedOpen + postedAccepted) / totalPosted) * 100 : 0}%, #E87500 ${totalPosted ? ((postedOpen + postedAccepted) / totalPosted) * 100 : 0}% ${totalPosted ? ((postedOpen + postedAccepted + postedInTransit) / totalPosted) * 100 : 0}%, #18864B ${totalPosted ? ((postedOpen + postedAccepted + postedInTransit) / totalPosted) * 100 : 0}% ${totalPosted ? ((postedOpen + postedAccepted + postedInTransit + postedDelivered + postedCompleted) / totalPosted) * 100 : 0}%, #D62828 ${totalPosted ? ((postedOpen + postedAccepted + postedInTransit + postedDelivered + postedCompleted) / totalPosted) * 100 : 0}% 100%, #D7DCE4 100% 100%)` }}>
              <div><strong>{totalPosted}</strong><span>Total jobs</span></div>
            </div>
            <p>Live counts from your account. Chart segments and bars are based on actual job statuses; colours always retain the same meaning in every market.</p>
          </div>
        </div>
      </section>

      <section
        className="ops-section ops-section-fulfilment"
        style={{
          marginTop: 28,
          border: "1px solid var(--color-border)",
          borderRadius: 12,
          padding: 20,
        }}
      >
        <h2>
          Fulfilment activity
        </h2>

        <div
          style={{
            display: "grid",
            gridTemplateColumns:
              "repeat(auto-fit, minmax(150px, 1fr))",
            gap: 12,
            marginTop: 14,
          }}
        >
          <div>
            <strong>
              {acceptedJobs}
            </strong>
            <div>
              Accepted
            </div>
          </div>

          <div>
            <strong>
              {acceptedInTransit}
            </strong>
            <div>
              In transit
            </div>
          </div>

          <div>
            <strong>
              {acceptedDelivered}
            </strong>
            <div>
              Delivered
            </div>
          </div>

          <div>
            <strong>
              {acceptedCompleted}
            </strong>
            <div>
              Completed
            </div>
          </div>
        </div>
      </section>

      {ukEligible && (
        <section
          className="ops-section ops-section-promotion"
          aria-labelledby="launch-status-heading"
          style={{
            marginTop: 28,
            padding: 20,
            border:
              "1px solid var(--color-border)",
            borderRadius: 12,
          }}
        >
          <h2 id="launch-status-heading">
            UK launch status
          </h2>

          <p>
            Account status:{" "}
            <strong>{account.isTester ? "Tester" : account.testerApprovalStatus === "pending" ? "Tester application pending review" : account.testerApprovalStatus === "rejected" ? "Tester application rejected" : account.verificationStatus}</strong>
          </p>

          {!entitlementStatus?.launch?.configured ? (
            <p role="status">
              Launch dates have not been published yet. Free launch access is not available until they are; you can still complete verification.
            </p>
          ) : (
            <>
              {entitlementStatus.post.reason === "month_0" && entitlementStatus.post.opensAt && (
                <p role="status">
                  <strong>Pre-launch:</strong> you can register and complete verification now. Posting jobs opens on{" "}
                  <strong>{formatMarketDate(entitlementStatus.post.opensAt, { country: account.country, currency: account.currency })}</strong>.
                </p>
              )}
              {(entitlementStatus.post.reason === "poster_window" || entitlementStatus.post.reason === "new_poster_trial" || entitlementStatus.post.reason === "pilot") && entitlementStatus.post.endsAt && (
                <p>
                  Posting jobs is free until <strong>{formatMarketDate(entitlementStatus.post.endsAt, { country: account.country, currency: account.currency })}</strong>.
                </p>
              )}
              {entitlementStatus.drive.reason === "driver_window" && entitlementStatus.drive.endsAt && (
                <p>
                  Taking jobs is free until <strong>{formatMarketDate(entitlementStatus.drive.endsAt, { country: account.country, currency: account.currency })}</strong>.
                </p>
              )}
              {entitlementStatus.drive.reason === "waitlisted" && (
                <p role="status">
                  Waitlist position: <strong>{entitlementStatus.drive.waitlistPosition ?? "pending"}</strong> in {account.operatingRegion}. Free driving places in each area are limited while the launch driver window runs; you are admitted automatically when a place opens.
                </p>
              )}
              {entitlementStatus.drive.reason === "region_required" && (
                <p role="status">
                  Add your operating area in <Link href="/settings">account settings</Link> to join the free driving waitlist for your area.
                </p>
              )}
              {entitlementStatus.drive.reason === "driver_window_not_open" && entitlementStatus.drive.opensAt && (
                <p>
                  Free driving opens on <strong>{formatMarketDate(entitlementStatus.drive.opensAt, { country: account.country, currency: account.currency })}</strong>.
                </p>
              )}
            </>
          )}

          {entitlementStatus?.billing?.nextBillingAt && (
            <p>
              Next billing date: <strong>{formatMarketDate(entitlementStatus.billing.nextBillingAt, { country: account.country, currency: account.currency })}</strong>
              {entitlementStatus.billing.period ? ` (${entitlementStatus.billing.plan === "poster" ? "monthly" : "every 7 days"})` : ""}. {checkoutConnected ? "Nothing is taken automatically: you pay each period yourself." : "Checkout is not connected yet, so nothing is charged in the app."}
            </p>
          )}

          {(entitlementStatus?.billing?.plan === "individual" || entitlementStatus?.billing?.plan === "fleet") && (
            <PlanSwitchControl
              requestedAt={account.switchToPosterRequestedAt ? account.switchToPosterRequestedAt.toISOString() : null}
              effectiveLabel={
                account.switchToPosterRequestedAt && entitlementStatus.billing.driverPlanEndsAt
                  ? formatMarketDate(entitlementStatus.billing.driverPlanEndsAt, { country: account.country, currency: account.currency })
                  : entitlementStatus.billing.currentPeriod
                  ? formatMarketDate(entitlementStatus.billing.currentPeriod.end, { country: account.country, currency: account.currency })
                  : null
              }
            />
          )}

          {!account.testerApprovalStatus && (
            <p style={{ marginTop: 16 }}>Your referral code: <strong>{account.displayId}</strong>. Referrals are recorded but do not add free time.</p>
          )}
        </section>
      )}

      <section
        className="ops-section ops-section-access"
        style={{
          marginTop: 28,
          border: "1px solid var(--color-border)",
          borderRadius: 12,
          padding: 20,
        }}
      >
        <h2>
          Access & subscription
        </h2>

        {weeklyPricingEligible ? (
          <>
            <p>
              {plan.description}
            </p>

            {plan.price !== null && (
              <p>
                Paid plan:{" "}
                <strong>
                  {formatMarketCurrency(plan.price, { country: account.country, currency: account.currency })}
                  {plan.key === "poster" ? "/month" : "/7 days"}
                </strong>
              </p>
            )}
            <p role="note" style={{ color: "var(--color-muted)", fontSize: 13 }}>
              {checkoutConnected
                ? "You pay each period yourself on a secure checkout page. Nothing is taken automatically."
                : "This is a planning price only. Payment checkout is not connected yet, so paid access cannot currently be purchased or renewed in the app."}
            </p>
          </>
        ) : (
          <p>
            Weekly pricing for this market will be configured separately.
          </p>
        )}
      </section>

    </main>
  );
}