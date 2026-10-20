"use client";

const plans = [
  { name: "Individual", detail: "1 verified person · 1 vehicle", gbp: "£9.99", eur: "€9.99", local: "9.99 in local currency" },
  { name: "Fleet 2–5", detail: "2–5 vehicles", gbp: "£16.99", eur: "€16.99", local: "16.99 in local currency" },
  { name: "Fleet 6–15", detail: "6–15 vehicles", gbp: "£24.99", eur: "€24.99", local: "24.99 in local currency" },
  { name: "Fleet 16–30", detail: "16–30 vehicles", gbp: "£36.99", eur: "€36.99", local: "36.99 in local currency" },
  { name: "Fleet 31–55", detail: "31–55 vehicles", gbp: "£49.99", eur: "€49.99", local: "49.99 in local currency" },
];

export default function SubscriptionPricing() {
  return (
    <section style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: 14, padding: 24, boxShadow: "0 1px 3px rgba(16, 42, 67, 0.08)" }}>
      <div style={{ marginBottom: 18 }}>
        <h2 style={{ margin: 0, fontSize: 20, color: "var(--color-primary)" }}>Simple 7-day access</h2>
        <p style={{ margin: "8px 0 0", color: "var(--color-muted)", lineHeight: 1.5 }}>
          Choose an individual account or a fleet tier. Each access period lasts 7 × 24 hours from activation or renewal.
        </p>
      </div>

      <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(190px, 1fr))", gap: 12 }}>
        {plans.map((plan) => (
          <div key={plan.name} style={{ border: "1px solid #D9E2EC", borderRadius: 10, padding: 16, background: "var(--color-background)" }}>
            <h3 style={{ margin: "0 0 4px", fontSize: 14, color: "var(--color-muted)" }}>{plan.name}</h3>
            <div style={{ fontSize: 12, color: "var(--color-muted)", marginBottom: 12 }}>{plan.detail}</div>
            <div style={{ fontSize: 22, fontWeight: 700, color: "var(--color-primary)" }}>{plan.gbp}<span style={{ fontSize: 12, fontWeight: 500 }}> GBP</span></div>
            <div style={{ fontSize: 22, fontWeight: 700, color: "var(--color-primary)", marginTop: 4 }}>{plan.eur}<span style={{ fontSize: 12, fontWeight: 500 }}> EUR</span></div>
            <div style={{ fontSize: 13, color: "var(--color-muted)", marginTop: 8 }}>{plan.local}</div>
            <div style={{ fontSize: 13, color: "var(--color-muted)", marginTop: 4 }}>per 7 days</div>
          </div>
        ))}
      </div>

      <div style={{ marginTop: 16, padding: "12px 14px", borderRadius: 8, background: "var(--color-background)", color: "var(--color-positive)", fontSize: 14 }}>
        Unlimited legitimate marketplace activity · No per-job charges
      </div>
      <p style={{ margin: "14px 0 0", fontSize: 13, color: "var(--color-muted)" }}>
        Fleets with 56+ vehicles need a custom plan. The same numeric tiers apply in each supported non-India market using that market’s local currency. India pricing remains separate. Prices are published for product planning; payment checkout is not connected yet.
      </p>
    </section>
  );
}
