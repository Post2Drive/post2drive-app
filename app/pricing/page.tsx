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
          The configured 7-day access model and numeric price tiers apply across supported non-India markets, displayed in each market’s local currency. India pricing remains separate. These are planning prices only; checkout is not connected.
        </p>
      </div>

      <SubscriptionPricing />
    </main>
  );
}
