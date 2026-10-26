"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type AccessData = {
  allowed: boolean;
  reason: string;
  planType: "individual" | "fleet";
  fleetVehicleCount: number | null;
  verificationStatus: string;
  companyVerificationStatus?: string;
  accountType?: "poster" | "driver" | "both";
  hasVerifiedVehicle?: boolean;
  billingCadence?: "monthly" | "weekly";
  trialEndsAt: string | null;
  freeEndsAt: string | null;
  subscriptionStatus: string;
  subscriptionEndsAt: string | null;
  subscriptionPlanKey: string | null;
  endsAt: string | null;
  price: number | null;
  currency: string;
  marketLabel: string;
  locale: string;
  timeZone: string;
  priceGbp?: number | null;
  pendingPayment: {
    id: string;
    amountMinorUnits: number;
    currency: string;
    status: string;
  } | null;
};

function formatDate(value: string | null, locale = "en", timeZone = "UTC") {
  if (!value) return null;

  return new Intl.DateTimeFormat(locale, {
    timeZone,
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
    hourCycle: "h23",
    timeZoneName: "short",
  }).format(new Date(value));
}

export default function SubscriptionStatus() {
  const [data, setData] = useState<AccessData | null>(null);
  const [converting, setConverting] = useState(false);
  const [conversionMessage, setConversionMessage] = useState("");

  useEffect(() => {
    fetch("/api/account/access")
      .then((response) => {
        if (!response.ok) throw new Error("Unable to load access.");
        return response.json();
      })
      .then(setData)
      .catch(() => undefined);
  }, []);

  if (!data) return null;

  const trialActive =
    data.reason === "promotional" &&
    Boolean(data.freeEndsAt || data.trialEndsAt);

  const paidActive =
    data.reason === "paid" &&
    Boolean(data.subscriptionEndsAt);

  const statusTitle = trialActive
    ? "Free access active"
    : paidActive
      ? "Paid access active"
      : data.reason === "verification_required"
        ? "Verification required"
        : "Access needs renewal";

  const statusColor = trialActive
    ? "var(--color-positive)"
    : paidActive
      ? "var(--color-primary-action)"
      : data.reason === "verification_required"
        ? "var(--color-warning)"
        : "var(--color-danger)";
  const statusTextColor = data.reason === "verification_required"
    ? "var(--color-text)"
    : statusColor;

  const endsAt = formatDate(
    data.endsAt || data.freeEndsAt || data.subscriptionEndsAt,
    data.locale,
    data.timeZone,
  );
  const formattedPrice = data.price === null || !data.currency ? null : new Intl.NumberFormat(data.locale || "en", { style: "currency", currency: data.currency }).format(data.price);
  const showPlanPrice = formattedPrice !== null &&
    (trialActive || (!data.allowed && data.reason === "access_expired"));

  const planName =
    data.planType === "fleet"
      ? `Fleet${data.fleetVehicleCount ? ` · ${data.fleetVehicleCount} vehicles` : ""}`
      : "Individual";

  return (
    <section
      style={{
        background: "var(--color-surface)",
        border: "1px solid var(--color-border)",
        borderRadius: 14,
        padding: 20,
        boxShadow: "var(--shadow-card)",
      }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          gap: 16,
          alignItems: "flex-start",
          flexWrap: "wrap",
        }}
      >
        <div>
          <div
            style={{
              fontSize: 13,
              fontWeight: 700,
              letterSpacing: 0.4,
              textTransform: "uppercase",
              color: "var(--color-muted)",
              marginBottom: 7,
            }}
          >
            Access
          </div>

          <h2
            style={{
              margin: 0,
              color: "var(--color-primary)",
              fontSize: 21,
            }}
          >
            {statusTitle}
          </h2>

          <p
            style={{
              margin: "7px 0 0",
              color: "var(--color-muted)",
            }}
          >
            {planName}
            {endsAt ? ` · until ${endsAt}` : ""}
          </p>
        </div>

        <span
          style={{
            background: "var(--color-surface)",
            color: statusTextColor,
            border: `1px solid ${statusColor}`,
            borderLeft: `4px solid ${statusColor}`,
            borderRadius: 8,
            padding: "7px 11px",
            fontSize: 13,
            fontWeight: 700,
          }}
        >
          {trialActive
            ? "FREE TRIAL"
            : paidActive
              ? "ACTIVE"
              : data.reason === "verification_required"
                ? "VERIFY"
                : "RENEW"}
        </span>
      </div>

      {showPlanPrice && (
        <div
          style={{
            marginTop: 17,
            borderTop: "1px solid var(--color-border)",
            paddingTop: 15,
            display: "flex",
            alignItems: "flex-start",
            justifyContent: "space-between",
            gap: 16,
            flexWrap: "wrap",
          }}
        >
          <div style={{ maxWidth: 520 }}>
            <div style={{ color: "var(--color-muted)", fontSize: 13 }}>
              {trialActive ? "After your free access" : data.billingCadence === "monthly" ? "Poster subscription" : "Configured driver access price"}
            </div>

            <div
              style={{
                marginTop: 3,
                fontWeight: 700,
                color: "var(--color-primary)",
                fontSize: 18,
              }}
            >
              {formattedPrice} / {data.billingCadence === "monthly" ? "month" : "7 days"}
            </div>

            <div
              style={{
                marginTop: 3,
                color: "var(--color-positive)",
                fontSize: 13,
              }}
            >
              Unlimited legitimate marketplace activity · No per-job charges
            </div>
            <p style={{ margin: "8px 0 0", color: "var(--color-muted)", fontSize: 12, lineHeight: 1.5 }}>
              Planning price only: payment checkout and automatic recurring billing are not connected yet. Verification fees are separate one-time charges. Poster access is monthly; verified vehicle/fleet access uses the applicable weekly plan.
            </p>
          </div>

          <Link
            href="/pricing"
            style={{
              display: "inline-block",
              background: "var(--color-primary-action)",
              color: "var(--color-surface)",
              padding: "9px 14px",
              borderRadius: 8,
              textDecoration: "none",
              fontWeight: 700,
              fontSize: 14,
            }}
            className="button-link">
            View pricing
          </Link>
        </div>
      )}

      {data.subscriptionPlanKey === "poster-monthly" && data.hasVerifiedVehicle && data.subscriptionStatus === "active" && (
        <div style={{ marginTop: 15, border: "1px solid var(--color-primary-action)", borderRadius: 9, padding: "11px 13px", fontSize: 13 }}>
          <p style={{ margin: "0 0 10px" }}>Your vehicle is verified. Convert your existing monthly plan to weekly driver access now; the first weekly renewal is due seven days after conversion, not immediately. No second subscription is created.</p>
          <button type="button" disabled={converting} onClick={async () => {
            setConverting(true);
            setConversionMessage("");
            try {
              const response = await fetch("/api/subscription/convert-to-weekly", { method: "POST", credentials: "same-origin" });
              const result = await response.json();
              if (!response.ok) throw new Error(result.error || "Unable to convert subscription.");
              setData((current) => current ? { ...current, subscriptionPlanKey: result.planKey, subscriptionEndsAt: result.firstWeeklyRenewalAt, endsAt: result.firstWeeklyRenewalAt, billingCadence: "weekly" } : current);
              setConversionMessage(`Converted. Your first weekly renewal is due ${formatDate(result.firstWeeklyRenewalAt, data.locale, data.timeZone) ?? "in 7 days"}. Automatic charging is not active until a payment provider is connected.`);
            } catch (error) {
              setConversionMessage(error instanceof Error ? error.message : "Unable to convert subscription.");
            } finally {
              setConverting(false);
            }
          }} style={{ border: 0, borderRadius: 8, padding: "9px 12px", background: "var(--color-primary-action)", color: "var(--color-surface)", fontWeight: 700, cursor: converting ? "wait" : "pointer" }}>
            {converting ? "Converting…" : "Convert to weekly driver access"}
          </button>
          {conversionMessage && <p role="status" style={{ margin: "10px 0 0" }}>{conversionMessage}</p>}
        </div>
      )}

      {data.pendingPayment && (
        <div
          style={{
            marginTop: 15,
            background: "#FFFFFF",
            border: "1px solid var(--color-warning)",
            borderLeft: "4px solid var(--color-warning)",
            color: "var(--color-text)",
            borderRadius: 9,
            padding: "11px 13px",
            fontSize: 13,
          }}
        >
          A subscription payment is currently marked <strong>pending</strong>.
          No payment provider is connected yet, so no automatic charge or
          payment confirmation will occur.
        </div>
      )}

      {!data.allowed && data.reason === "access_expired" && (
        <div
          style={{
            marginTop: 15,
            background: "#FFFFFF",
            border: "1px solid var(--color-danger)",
            borderLeft: "4px solid var(--color-danger)",
            color: "var(--color-danger)",
            borderRadius: 9,
            padding: "11px 13px",
            fontSize: 13,
          }}
        >
          Your {data.marketLabel.toLowerCase()} marketplace access has expired. Renewing will restore
          marketplace access once payment is successfully confirmed.
        </div>
      )}
    </section>
  );
}
