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
          Pricing by market
        </h1>

        <p
          style={{
            margin: "8px 0 0",
            color: "#6B7C93",
          }}
        >
          The published 7-day individual and fleet prices currently apply to the UK (GBP) and supported euro markets (EUR). Additional supported countries can register in their local currency, but local pricing is not configured yet.
        </p>
      </div>

      <SubscriptionPricing />
    </main>
  );
}
