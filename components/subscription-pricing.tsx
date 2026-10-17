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
    <section className="pricing-panel" style={{ borderRadius: 18, padding: 24 }}>
      <div style={{ marginBottom: 18 }}>
        <h2 style={{ margin: 0, fontSize: 20 }}>Pricing for your market</h2>
        <p style={{ margin: "8px 0 0", color: "var(--color-muted)", lineHeight: 1.5 }}>
          Select your country to see the configured access tiers in its currency. Prices are planning prices only; payment checkout is not connected.
        </p>
      </div>

      <label style={{ display: "block", maxWidth: 420, marginBottom: 20, color: "var(--color-text)", fontSize: 14, fontWeight: 700 }}>
        Country / market
        <select value={country} onChange={(event) => setCountry(event.target.value)} style={{ display: "block", width: "100%", marginTop: 6, padding: 10 }}>
          {COUNTRIES.map((market) => <option key={market.code} value={market.code}>{market.name} · {market.currency}</option>)}
        </select>
      </label>

      {isIndia ? (
        <div role="status" className="pricing-market-note" style={{ padding: 18 }}>
          <strong>India pricing is configured separately.</strong>
          <p style={{ marginBottom: 0 }}>Prices for India will be confirmed before any paid plan becomes available. Creating an account does not charge you.</p>
        </div>
      ) : (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 12 }}>
            {plans.map((plan) => (
              <div key={plan.name} className="pricing-tier-card" style={{ padding: 16 }}>
                <div className="pricing-tier-name" style={{ fontSize: 14, marginBottom: 4 }}>{plan.name}</div>
                <div style={{ fontSize: 12, color: "var(--color-muted)", marginBottom: 12 }}>{plan.detail}</div>
                <div className="pricing-tier-price">{formatter.format(plan.amount)}</div>
                <div style={{ fontSize: 13, color: "var(--color-muted)", marginTop: 8 }}>per 7 days</div>
              </div>
            ))}
          </div>
          <div className="pricing-benefit-strip" style={{ marginTop: 16, padding: "12px 14px", fontSize: 14 }}>
            Unlimited legitimate marketplace activity · No per-job charges
          </div>
          <p style={{ margin: "14px 0 0", fontSize: 13, color: "var(--color-muted)" }}>
            Fleets with 56+ vehicles need a custom plan. The same numeric tiers are displayed in {selectedMarket.name} using {selectedMarket.currency}. No payment is taken at signup and checkout is not connected.
          </p>
        </>
      )}
    </section>
  );
}
