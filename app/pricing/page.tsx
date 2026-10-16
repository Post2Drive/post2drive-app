import SubscriptionPricing from "@/components/subscription-pricing";

export default function PricingPage() {
  return (
    <main
      style={{
        maxWidth: 1100,
        margin: "0 auto",
        padding: "32px 20px 60px",
      }}
    >
      <div style={{ marginBottom: 24 }}>
        <h1
          style={{
            margin: 0,
            fontSize: 32,
            color: "#102A43",
          }}
        >
          Pricing
        </h1>

        <p
          style={{
            margin: "8px 0 0",
            color: "#6B7C93",
          }}
        >
          Simple weekly access for the UK marketplace.
        </p>
      </div>

      <SubscriptionPricing />
    </main>
  );
}
