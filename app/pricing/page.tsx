import type { Metadata } from "next";
import SubscriptionPricing from "@/components/subscription-pricing";
import { subscriptionCheckoutConnected } from "@/lib/paymentProvider";

// Reads provider configuration at request time, not at build time.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Pricing – Post2Drive",
  description: "Everything Post2Drive costs, before you sign up: plans, launch offers, verification fees and what you need.",
};

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
          Pricing and requirements
        </h1>

        <p
          style={{
            margin: "8px 0 0",
            color: "var(--color-muted)",
          }}
        >
          Everything you could pay and everything you will need, shown before you create an account. No per-job fees, no commission, no hidden charges.{" "}
          {subscriptionCheckoutConnected()
            ? "Nothing is taken automatically: you pay each period yourself on a secure checkout page."
            : "Checkout is not connected yet, so nothing is charged today."}
        </p>
      </div>

      <SubscriptionPricing checkoutConnected={subscriptionCheckoutConnected()} />
    </main>
  );
}
