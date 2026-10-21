"use client";

import { useState } from "react";
import { COUNTRIES } from "@/lib/currency";

const plans = [
  { name: "Individual", detail: "1 verified person · 1 vehicle", amount: 9.99 },
  { name: "Fleet 2–5", detail: "2–5 vehicles", amount: 16.99 },
  { name: "Fleet 6–15", detail: "6–15 vehicles", amount: 24.99 },
  { name: "Fleet 16–30", detail: "16–30 vehicles", amount: 36.99 },
  { name: "Fleet 31–55", detail: "31–55 vehicles", amount: 49.99 },
];

export default function SubscriptionPricing() {
  const [country, setCountry] = useState("GB");
  const selectedMarket = COUNTRIES.find((market) => market.code === country) ?? COUNTRIES[0];
  const isIndia = selectedMarket.code === "IN";
  const formatter = new Intl.NumberFormat(selectedMarket.locale, {
    style: "currency",
    currency: selectedMarket.currency,
  });

  return (
    <section className="pricing-panel" style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: 14, padding: 24, boxShadow: "0 1px 3px rgba(16, 42, 67, 0.08)" }}>
      <div style={{ marginBottom: 18 }}>
        <h2 style={{ margin: 0, fontSize: 20, color: "var(--color-primary)" }}>Simple 7-day access</h2>
        <p style={{ margin: "8px 0 0", color: "var(--color-muted)", lineHeight: 1.5 }}>
          Choose an individual account or a fleet tier. Each access period lasts 7 × 24 hours from activation or renewal.
        </p>
      </div>

      {isIndia ? (
        <div role="status" className="pricing-market-note" style={{ padding: 18, border: "1px solid var(--color-border)", borderRadius: 10, background: "var(--color-background)" }}>
          <strong>India pricing is configured separately.</strong>
          <p style={{ marginBottom: 0 }}>Prices for India will be confirmed before any paid plan becomes available. Creating an account does not charge you.</p>
        </div>
      ) : (
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 12 }}>
          {plans.map((plan) => (
            <div key={plan.name} className="pricing-tier-card" style={{ border: "1px solid var(--color-border)", borderRadius: 10, padding: 16, background: "var(--color-background)" }}>
              <h3 className="pricing-tier-name" style={{ margin: "0 0 4px", fontSize: 14, color: "var(--color-muted)" }}>{plan.name}</h3>
              <div style={{ fontSize: 12, color: "var(--color-muted)", marginBottom: 12 }}>{plan.detail}</div>
              <div className="pricing-tier-price" style={{ fontSize: 22, fontWeight: 700, color: "var(--color-primary)" }}>{formatter.format(plan.amount)}</div>
              <div style={{ fontSize: 13, color: "var(--color-muted)", marginTop: 4 }}>per 7 days</div>
            </div>
          ))}
        </div>
      )}

      <div style={{ marginTop: 16, padding: "12px 14px", borderRadius: 8, background: "var(--color-background)", color: "var(--color-positive)", fontSize: 14 }}>
        Unlimited legitimate marketplace activity · No per-job charges
      </div>
      <p style={{ margin: "14px 0 0", fontSize: 13, color: "var(--color-muted)" }}>
        Fleets with 56+ vehicles need a custom plan. The same numeric tiers apply in each supported non-India market using that market’s local currency. India pricing remains separate. Prices are published for product planning; payment checkout is not connected yet.
      </p>
    </section>
  );
}
