"use client";

import { COUNTRIES } from "@/lib/currency";
import {
  FLEET_MAX_STANDARD_VEHICLES,
  PUBLIC_PLANS,
  VERIFICATION_FEES,
} from "@/lib/pricing";

const card = { border: "1px solid var(--color-border)", borderRadius: 10, padding: 16, background: "var(--color-background)" } as const;
const sectionStyle = { marginTop: 28 } as const;
const h2 = { margin: "0 0 6px", fontSize: 20, color: "var(--color-primary)" } as const;
const muted = { margin: "0 0 12px", color: "var(--color-muted)", lineHeight: 1.5 } as const;
const list = { margin: 0, paddingLeft: 20, lineHeight: 1.7 } as const;

/**
 * Public, pre-signup cost and requirements disclosure. Every price comes from
 * lib/pricing.ts so this page can never drift from what the app charges.
 */
export default function SubscriptionPricing({ country = "GB" }: { country?: string }) {
  const selectedMarket = COUNTRIES.find((market) => market.code === country.trim().toUpperCase()) ?? COUNTRIES[0];
  const isIndia = selectedMarket.code === "IN";
  const money = new Intl.NumberFormat(selectedMarket.locale, { style: "currency", currency: selectedMarket.currency });

  if (isIndia) {
    return (
      <section className="pricing-panel" aria-labelledby="pricing-india" style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: 14, padding: 24 }}>
        <h2 id="pricing-india" style={h2}>India</h2>
        <p style={{ ...muted, marginBottom: 0 }}>Free marketplace access after phone OTP verification. No person or company verification fee. Creating an account does not charge you.</p>
      </section>
    );
  }

  return (
    <div className="pricing-panel" style={{ background: "var(--color-surface)", border: "1px solid var(--color-border)", borderRadius: 14, padding: 24, boxShadow: "0 1px 3px rgba(16, 42, 67, 0.08)" }}>
      <section aria-labelledby="pricing-plans">
        <h2 id="pricing-plans" style={h2}>Plans</h2>
        <p style={muted}>
          One account. Stop after company checks and you are a <strong>poster</strong>, billed monthly.
          Add a verified vehicle and you become a <strong>driver or fleet</strong>: you can take jobs and still post,
          billed per 7 days instead. You never pay for both.
        </p>
        <ul role="list" style={{ listStyle: "none", padding: 0, margin: 0, display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: 12 }}>
          {PUBLIC_PLANS.map((plan) => (
            <li key={plan.key} className="pricing-tier-card" style={card}>
              <h3 className="pricing-tier-name" style={{ margin: "0 0 4px", fontSize: 14, color: "var(--color-muted)" }}>{plan.name}</h3>
              <div style={{ fontSize: 12, color: "var(--color-muted)", marginBottom: 12 }}>{plan.detail}</div>
              <div className="pricing-tier-price" style={{ fontSize: 22, fontWeight: 700, color: "var(--color-primary)" }}>{money.format(plan.amount)}</div>
              <div style={{ fontSize: 13, color: "var(--color-muted)", marginTop: 4 }}>per {plan.period}</div>
            </li>
          ))}
        </ul>
        <p style={{ marginTop: 14, padding: "12px 14px", borderRadius: 8, background: "var(--color-background)", color: "var(--color-positive)", fontSize: 14 }}>
          Unlimited legitimate marketplace activity · No per-job charges · No commission · We never handle your job payments
        </p>
        <p style={{ ...muted, fontSize: 13 }}>Fleets with more than {FLEET_MAX_STANDARD_VEHICLES} vehicles need a custom plan.</p>
      </section>

      <section aria-labelledby="pricing-launch" style={sectionStyle}>
        <h2 id="pricing-launch" style={h2}>Launch offers</h2>
        <ul style={list}>
          <li><strong>Posters:</strong> free for 12 months from the launch start date to the launch end date. Posters who register before launch are told the start date in advance. After the launch window, new posters get their first month free.</li>
          <li><strong>Drivers and fleets:</strong> free for the first 3 months of the launch window. Places are released by area so there is enough work for every driver; if your area is full you join a waiting list. After that window there is no free period for new drivers.</li>
          <li>Exact dates are published here before launch. Verification fees still apply during launch offers.</li>
        </ul>
      </section>

      <section aria-labelledby="pricing-verification" style={sectionStyle}>
        <h2 id="pricing-verification" style={h2}>One-off verification fees</h2>
        <p style={muted}>Separate from your plan. Paid once per check, in a single payment.</p>
        <dl style={{ margin: 0 }}>
          {[
            ["Posters: person and company (or sole trader)", VERIFICATION_FEES.personAndCompany],
            ["Drivers and fleets: person, driving licence and first vehicle (registration, MOT, insurance). Driver-only accounts do not pay the poster fee.", VERIFICATION_FEES.driverAndFirstVehicle],
            ["Each additional vehicle, including vehicles added later", VERIFICATION_FEES.additionalVehicle],
          ].map(([label, fee]) => (
            <div key={String(label)} style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 16, padding: "10px 0", borderBottom: "1px solid var(--color-border)" }}>
              <dt style={{ margin: 0, lineHeight: 1.5 }}>{label}</dt>
              <dd style={{ margin: 0, fontWeight: 700, whiteSpace: "nowrap" }}>{money.format(Number(fee))}</dd>
            </div>
          ))}
        </dl>
      </section>

      <section aria-labelledby="pricing-needs" style={sectionStyle}>
        <h2 id="pricing-needs" style={h2}>What you will need</h2>
        <ul style={list}>
          <li><strong>Everyone:</strong> email address, mobile number, photo ID and a selfie, and company details or sole trader details. A company names one responsible person, who must pass the identity check.</li>
          <li><strong>Drivers:</strong> everything above, plus a valid driving licence and, for each vehicle, its registration, MOT and insurance certificate.</li>
          <li><strong>Fleets:</strong> every fleet vehicle must be owned or leased by the company and insured on the company&apos;s commercial policy. Each job records which driver and vehicle carried it. Owner-drivers with their own vans join as individual drivers and can receive work from fleets through private job invites.</li>
          <li>One verified person can be a driver on only one account.</li>
        </ul>
      </section>

      <section aria-labelledby="pricing-before-pay" style={sectionStyle}>
        <h2 id="pricing-before-pay" style={h2}>Before you pay</h2>
        <ul style={list}>
          <li>A verification fee pays for the check, not for passing it, and is not refundable.</li>
          <li>If a check fails, you get 10 working days to correct it, then a final 3 working days, at no extra cost.</li>
          <li>Rechecks are free within 90 days of passing, and always free while you are on a paid plan.</li>
          <li>Moving from poster to driver: you can take jobs as soon as your vehicle passes. Seven days later your billing switches from monthly to every 7 days, and unused days of your monthly payment are credited.</li>
          <li>Moving from driver back to poster: switch at the end of your current 7-day period.</li>
          <li>We keep verification records to run the marketplace safely and meet legal duties. We never sell your data.</li>
        </ul>
      </section>

      <p style={{ ...muted, fontSize: 13, marginTop: 24, marginBottom: 0 }}>
        The same numbers apply in each supported non-India market, in that market&apos;s currency. Payment checkout is not connected yet: no payment is taken today.
      </p>
    </div>
  );
}
