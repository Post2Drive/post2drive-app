"use client";

const plans = [
  ["Individual", "£9.99", "7 days"],
  ["Fleet 2–5", "£16.99", "7 days"],
  ["Fleet 6–15", "£24.99", "7 days"],
  ["Fleet 16–30", "£36.99", "7 days"],
  ["Fleet 31–55", "£49.99", "7 days"],
];

export default function SubscriptionPricing() {
  return (
    <section
      style={{
        background: "#FFFFFF",
        border: "1px solid #D9E2EC",
        borderRadius: 14,
        padding: 24,
        boxShadow: "0 1px 3px rgba(16, 42, 67, 0.08)",
      }}
    >
      <div style={{ marginBottom: 18 }}>
        <h2
          style={{
            margin: 0,
            fontSize: 20,
            color: "#102A43",
          }}
        >
          After your free access
        </h2>

        <p
          style={{
            margin: "8px 0 0",
            color: "#6B7C93",
            lineHeight: 1.5,
          }}
        >
          Continue with simple 7-day access. No per-job charges.
        </p>
      </div>

      <div
        style={{
          display: "grid",
          gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))",
          gap: 12,
        }}
      >
        {plans.map(([name, price, period]) => (
          <div
            key={name}
            style={{
              border: "1px solid #D9E2EC",
              borderRadius: 10,
              padding: 16,
              background: "#F4F7FA",
            }}
          >
            <div
              style={{
                fontSize: 14,
                color: "#6B7C93",
                marginBottom: 8,
              }}
            >
              {name}
            </div>

            <div
              style={{
                fontSize: 24,
                fontWeight: 700,
                color: "#102A43",
              }}
            >
              {price}
            </div>

            <div
              style={{
                fontSize: 13,
                color: "#6B7C93",
                marginTop: 4,
              }}
            >
              per {period}
            </div>
          </div>
        ))}
      </div>

      <div
        style={{
          marginTop: 16,
          padding: "12px 14px",
          borderRadius: 8,
          background: "#EAF4F3",
          color: "#00695C",
          fontSize: 14,
        }}
      >
        Unlimited legitimate marketplace activity · No per-job charges
      </div>

      <p
        style={{
          margin: "14px 0 0",
          fontSize: 13,
          color: "#6B7C93",
        }}
      >
        56+ vehicles: contact us for a custom fleet plan.
      </p>
    </section>
  );
}
