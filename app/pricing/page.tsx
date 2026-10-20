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
            color: "var(--color-primary)",
          }}
        >
          Pricing by market
        </h1>

        <p
          style={{
            margin: "8px 0 0",
            color: "var(--color-muted)",
          }}
        >
          The UK 7-day model applies across all supported markets except India, using each market’s local currency and the same numeric price tiers. India pricing remains separate.
        </p>
      </div>

      <SubscriptionPricing />
    </main>
  );
}
