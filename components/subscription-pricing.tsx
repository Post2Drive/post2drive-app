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
    <section style={{ background: "#FFFFFF", border: "1px solid #D9E2EC", borderRadius: 14, padding: 24, boxShadow: "0 1px 3px rgba(16, 42, 67, 0.08)" }}>
      <div style={{ marginBottom: 18 }}>
        <h2 style={{ margin: 0, fontSize: 20, color: "#102A43" }}>Pricing for your market</h2>
        <p style={{ margin: "8px 0 0", color: "#6B7C93", lineHeight: 1.5 }}>
          Select your country to see the configured access tiers in its currency. Prices are planning prices only; payment checkout is not connected.
        </p>
      </div>

      <label style={{ display: "block", maxWidth: 420, marginBottom: 20, color: "#334E68", fontSize: 14, fontWeight: 600 }}>
        Country / market
        <select value={country} onChange={(event) => setCountry(event.target.value)} style={{ display: "block", width: "100%", marginTop: 6, padding: 10, border: "1px solid #BCCCDC", borderRadius: 8, background: "#fff", color: "#102A43" }}>
          {COUNTRIES.map((market) => <option key={market.code} value={market.code}>{market.name} · {market.currency}</option>)}
        </select>
      </label>

      {isIndia ? (
        <div role="status" style={{ border: "1px solid #D9E2EC", borderRadius: 10, padding: 18, background: "#F4F7FA", color: "#334E68" }}>
          <strong>India pricing is configured separately.</strong>
          <p style={{ marginBottom: 0 }}>Prices for India will be confirmed before any paid plan becomes available. Creating an account does not charge you.</p>
        </div>
      ) : (
        <>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 12 }}>
            {plans.map((plan) => (
              <div key={plan.name} style={{ border: "1px solid #D9E2EC", borderRadius: 10, padding: 16, background: "#F4F7FA" }}>
                <div style={{ fontSize: 14, color: "#6B7C93", marginBottom: 4 }}>{plan.name}</div>
                <div style={{ fontSize: 12, color: "#6B7C93", marginBottom: 12 }}>{plan.detail}</div>
                <div style={{ fontSize: 22, fontWeight: 700, color: "#102A43" }}>{formatter.format(plan.amount)}</div>
                <div style={{ fontSize: 13, color: "#6B7C93", marginTop: 8 }}>per 7 days</div>
              </div>
            ))}
          </div>
          <div style={{ marginTop: 16, padding: "12px 14px", borderRadius: 8, background: "#EAF4F3", color: "#00695C", fontSize: 14 }}>
            Unlimited legitimate marketplace activity · No per-job charges
          </div>
          <p style={{ margin: "14px 0 0", fontSize: 13, color: "#6B7C93" }}>
            Fleets with 56+ vehicles need a custom plan. The same numeric tiers are displayed in {selectedMarket.name} using {selectedMarket.currency}. No payment is taken at signup and checkout is not connected.
          </p>
        </>
      )}
    </section>
  );
}
