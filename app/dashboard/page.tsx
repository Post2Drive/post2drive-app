import { getServerSession } from "next-auth";
import SubscriptionStatus from "@/components/subscription-status";
import { redirect } from "next/navigation";
import Link from "next/link";
import { authOptions } from "@/lib/auth";
import { prisma } from "@/lib/prisma";
import { formatMarketCurrency, formatMarketDate, getLocalisationProfile } from "@/lib/localisation";
import { getTrialCycleStatus } from "@/lib/trialCycles";
import {
  getPlanDisplay,
} from "@/lib/pricing";
import {
  isUkAccount,
} from "@/lib/uk";
import { isWeeklyPricingEligible } from "@/lib/pricing";

import SignOutButton from "@/app/sign-out-button";
import NotificationCenter from "@/components/notification-center";

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
    <div
      className="ops-theme-card"
      style={{
        border: "1px solid var(--color-border)",
        borderRadius: 12,
        padding: 18,
        minWidth: 150,
      }}
    >
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
        style={{
          display: "block",
          textDecoration: "none",
          color: "inherit",
          borderRadius: 12,
        }}
      >
        {content}
      </Link>
    );
  }

  return content;
}

export default async function DashboardPage() {
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

  const trialCycleStatus =
    ukEligible
      ? await getTrialCycleStatus(account.id)
      : null;

  const planKey =
    account.planType === "fleet"
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
    <div
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
            Welcome,{" "}
            {session.user?.name}
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

        <SignOutButton />
      </div>

      <NotificationCenter />

      <section
        className="ops-section ops-section-overview"
        style={{
          marginTop: 28,
        }}
      >
        <h2>
          Operations overview
        </h2>

        <div
          style={{
            display: "flex",
            gap: 14,
            flexWrap: "wrap",
            marginTop: 14,
          }}
        >
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
                <div role="img" aria-label={`Donut chart: ${postedOpen} open, ${postedAccepted} accepted, ${postedInTransit} in transit, ${postedDelivered} delivered, ${postedCompleted} completed, ${postedCancelled} cancelled jobs`} className="job-status-donut" style={{ background: `conic-gradient(#0057D9 0% ${postedOpen / totalPosted * 100}%, #6F2DBD ${postedOpen / totalPosted * 100}% ${(postedOpen + postedAccepted) / totalPosted * 100}%, #F06A00 ${(postedOpen + postedAccepted) / totalPosted * 100}% ${(postedOpen + postedAccepted + postedInTransit) / totalPosted * 100}%, #008A45 ${(postedOpen + postedAccepted + postedInTransit) / totalPosted * 100}% ${(postedOpen + postedAccepted + postedInTransit + postedDelivered) / totalPosted * 100}%, #178A45 ${(postedOpen + postedAccepted + postedInTransit + postedDelivered) / totalPosted * 100}% ${(postedOpen + postedAccepted + postedInTransit + postedDelivered + postedCompleted) / totalPosted * 100}%, #D71920 ${(postedOpen + postedAccepted + postedInTransit + postedDelivered + postedCompleted) / totalPosted * 100}% 100%)` }}>
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
          style={{
            marginTop: 28,
            padding: 20,
            border:
              "1px solid var(--color-border)",
            borderRadius: 12,
          }}
        >
          <h2>
            UK launch promotion
          </h2>

          <p>
            Account status:{" "}
            <strong>{account.isTester ? "Tester" : account.testerApprovalStatus === "pending" ? "Tester application pending review" : account.testerApprovalStatus === "rejected" ? "Tester application rejected" : account.verificationStatus}</strong>
          </p>

          {account.promotionParticipant ? (
            <>
              <p>
                Free access until:{" "}
                {account.freeEndsAt
                  ? formatMarketDate(account.freeEndsAt, { country: account.country, currency: account.currency })
                  : "Not started"}
              </p>

              <p>
                Extensions earned:{" "}
                {account.extensionCount} / 3
              </p>
            </>
          ) : (
            <p>
              {account.isTester
                ? "Your tester account follows the normal promotional duration, extension and subscription rules."
                : account.testerApprovalStatus === "pending"
                ? "Your tester application is awaiting administrator review. Access and the normal promotional trial will begin only after approval."
                : account.testerApprovalStatus === "rejected"
                ? "Your tester application was not approved. Tester access is not enabled; contact the administrator if you need clarification."
                : "Complete verification to become eligible for the UK promotional programme."}
            </p>
          )}

          {trialCycleStatus?.eligible ? (
            <div style={{ marginTop: 18, paddingTop: 16, borderTop: "1px solid var(--color-border)" }}>
              <h3>Trial qualification · Cycle {trialCycleStatus.cycleNumber + 1} of 4</h3>
              <p>
                Cycle status: <strong>{String(trialCycleStatus.status).replaceAll("_", " ")}</strong>
                {trialCycleStatus.status === "active" ? ` · ${trialCycleStatus.daysRemaining} days remaining` : ""}
              </p>
              <p>Jobs posted: <strong>{trialCycleStatus.actual.posterPosted} / {trialCycleStatus.targets.posterPostedAdjusted}</strong> (normal target {trialCycleStatus.targets.posterPosted})</p>
              <p>Jobs completed as poster: <strong>{trialCycleStatus.actual.posterCompleted} / {trialCycleStatus.targets.posterCompleted}</strong></p>
              <p>Jobs completed as driver: <strong>{trialCycleStatus.actual.driverCompleted} / {trialCycleStatus.targets.driverCompletedAdjusted}</strong> (normal target {trialCycleStatus.targets.driverCompleted})</p>
              <p>Verified referrals: <strong>{trialCycleStatus.actual.verifiedReferrals} / {trialCycleStatus.targets.verifiedReferrals}</strong></p>
              <p>Referred accounts completing a genuine job: <strong>{trialCycleStatus.actual.completedReferrals} / {trialCycleStatus.targets.completedReferrals}</strong></p>
              {trialCycleStatus.status === "grace" && trialCycleStatus.graceEndsAt && (
                <p role="status"><strong>30-day grace period:</strong> finish the remaining targets by {formatMarketDate(trialCycleStatus.graceEndsAt, { country: account.country, currency: account.currency })}.</p>
              )}
              {trialCycleStatus.status === "failed" && (
                <p role="alert">The targets were not completed within this cycle and its grace period. Free access has ended; choose the paid plan below to continue.</p>
              )}
              {trialCycleStatus.status === "promotion_ended" && (
                <p role="alert">The promotional programme has ended. Free access cannot be extended further.</p>
              )}
              {trialCycleStatus.status === "max_extensions_complete" && (
                <p>The maximum of three extensions has been reached. Your free access ends on the date shown above; a paid plan is needed afterwards.</p>
              )}
            </div>
          ) : (
            <p>Your cycle-based qualification targets begin when your three-month promotional period starts.</p>
          )}

          {!account.testerApprovalStatus && (
            <p style={{ marginTop: 16 }}>Your referral code: <strong>{account.displayId}</strong>. Referrals count toward the active cycle only.</p>
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
                  /7 days
                </strong>
              </p>
            )}
          </>
        ) : (
          <p>
            Weekly pricing for this market will be configured separately.
          </p>
        )}
      </section>

      <div
        style={{
          display: "flex",
          gap: 18,
          flexWrap: "wrap",
          marginTop: 28,
        }}
      >
        <Link href="/jobs" className="button-link button-link-secondary">
          View jobs →
        </Link>

        <Link href="/payments" className="button-link button-link-secondary">
          Payment dashboard →
        </Link>
        <Link href="/vehicles" className="button-link button-link-secondary">Vehicles &amp; Verification</Link>
      </div>
    </div>
  );
}