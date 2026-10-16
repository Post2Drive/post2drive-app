"use client";

const plans = [
  { name: "Individual", detail: "1 verified person · 1 vehicle", gbp: "£9.99", eur: "€9.99" },
  { name: "Fleet 2–5", detail: "2–5 vehicles", gbp: "£16.99", eur: "€16.99" },
  { name: "Fleet 6–15", detail: "6–15 vehicles", gbp: "£24.99", eur: "€24.99" },
  { name: "Fleet 16–30", detail: "16–30 vehicles", gbp: "£36.99", eur: "€36.99" },
  { name: "Fleet 31–55", detail: "31–55 vehicles", gbp: "£49.99", eur: "€49.99" },
];

export default function SubscriptionPricing() {
  return (
    <section style={{ background: "#FFFFFF", border: "1px solid #D9E2EC", borderRadius: 14, padding: 24, boxShadow: "0 1px 3px rgba(16, 42, 67, 0.08)" }}>
      <div style={{ marginBottom: 18 }}>
        <h2 style={{ margin: 0, fontSize: 20, color: "#102A43" }}>Simple 7-day access</h2>
        <p style={{ margin: "8px 0 0", color: "#6B7C93", lineHeight: 1.5 }}>
          Choose an individual account or a fleet tier. Each access period lasts 7 × 24 hours from activation or renewal.
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 12 }}>
        {plans.map((plan) => (
          <div key={plan.name} style={{ border: "1px solid #D9E2EC", borderRadius: 10, padding: 16, background: "#F4F7FA" }}>
            <div style={{ fontSize: 14, color: "#6B7C93", marginBottom: 4 }}>{plan.name}</div>
            <div style={{ fontSize: 12, color: "#6B7C93", marginBottom: 12 }}>{plan.detail}</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: "#102A43" }}>{plan.gbp}<span style={{ fontSize: 12, fontWeight: 500 }}> GBP</span></div>
            <div style={{ fontSize: 22, fontWeight: 700, color: "#102A43", marginTop: 4 }}>{plan.eur}<span style={{ fontSize: 12, fontWeight: 500 }}> EUR</span></div>
            <div style={{ fontSize: 13, color: "#6B7C93", marginTop: 8 }}>per 7 days</div>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 16, padding: "12px 14px", borderRadius: 8, background: "#EAF4F3", color: "#00695C", fontSize: 14 }}>
        Unlimited legitimate marketplace activity · No per-job charges
      </div>
      <p style={{ margin: "14px 0 0", fontSize: 13, color: "#6B7C93" }}>
        Fleets with 56+ vehicles need a custom plan. EUR pricing uses the same numeric tiers as GBP. India pricing remains separate. Prices are published for product planning; payment checkout is not connected yet.
      </p>
    </section>
  );
}
