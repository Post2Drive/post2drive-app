"use client";

import { useEffect, useState } from "react";
import Link from "next/link";

type AccessData = {
  allowed: boolean;
  reason: string;
  planType: "individual" | "fleet";
  fleetVehicleCount: number | null;
  verificationStatus: string;
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
    amountPence: number;
    currency: string;
    status: string;
  } | null;
};

function formatDate(value: string | null, locale = "en-GB", timeZone = "Europe/London") {
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

  const endsAt = formatDate(
    data.endsAt || data.freeEndsAt || data.subscriptionEndsAt,
    data.locale,
    data.timeZone,
  );
  const formattedPrice = data.price === null || !data.currency ? null : new Intl.NumberFormat(data.locale || "en-GB", { style: "currency", currency: data.currency }).format(data.price);

  const planName =
    data.planType === "fleet"
      ? `Fleet${data.fleetVehicleCount ? ` · ${data.fleetVehicleCount} vehicles` : ""}`
      : "Individual";

  return (
    <section
      style={{
        background: "var(--color-surface)",
        border: "1px solid #D9E2EC",
        borderRadius: 14,
        padding: 20,
        boxShadow: "0 1px 3px rgba(16,42,67,0.08)",
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
            background: `${statusColor}18`,
            color: statusColor,
            borderRadius: 999,
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

      {trialActive && formattedPrice !== null && (
        <div
          style={{
            marginTop: 17,
            borderTop: "1px solid #D9E2EC",
            paddingTop: 15,
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 16,
            flexWrap: "wrap",
          }}
        >
          <div>
            <div style={{ color: "var(--color-muted)", fontSize: 13 }}>
              After your free access
            </div>

            <div
              style={{
                marginTop: 3,
                fontWeight: 700,
                color: "var(--color-primary)",
                fontSize: 18,
              }}
            >
              {formattedPrice} / 7 days
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
           className="button-link button-link-secondary">
            View pricing
          </Link>
        </div>
      )}

      {data.pendingPayment && (
        <div
          style={{
            marginTop: 15,
            background: "#FFF8E1",
            border: "1px solid #F9A825",
            color: "#7A5600",
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
            background: "#FDECEC",
            border: "1px solid #D32F2F",
            color: "#A51E1E",
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
