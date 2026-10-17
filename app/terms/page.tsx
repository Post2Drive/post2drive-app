import Link from "next/link";

export default function TermsPage() {
  return <main style={{ maxWidth: 900, margin: "0 auto", padding: "32px 20px 64px" }}>
    <p><Link href="/signup">← Back to signup</Link></p>
    <h1>Post2Drive Terms of Service</h1>
    <p><strong>Version:</strong> 16 October 2026 · Draft for product testing</p>
    <p>Post2Drive is a delivery marketplace in development. These terms explain the basic rules for using the test service; the platform is not yet represented as a fully launched or fully regulated transport, payment or insurance service.</p>
    <h2>Marketplace role</h2><p>Post2Drive provides software to help businesses and drivers discover delivery opportunities, publish requirements, submit bids and coordinate delivery work. Unless a separate written agreement says otherwise, Post2Drive is not the carrier, employer, shipper, insurer, payment institution or contracting party to a delivery arrangement.</p>
    <h2>No guaranteed work or match</h2><p>A free trial, subscription, listing or account does not guarantee a delivery, income, a suitable driver, acceptance of a bid, or successful completion. Users must independently verify identity, vehicle suitability, licences, cargo requirements, insurance and the other party's suitability.</p>
    <h2>Accurate and lawful use</h2><p>Users must provide accurate information, use the correct country and currency, keep account access secure, respect other users' privacy, and not post unlawful, deceptive, unsafe or prohibited work. Cross-market matching is currently disabled; job listings remain in the account's selected market.</p>
    <h2>Pricing and payments</h2><p>Any plan price or access period shown is specific to the supported market and plan. A displayed price is not evidence that a payment provider is live. Do not send card credentials or other payment secrets through job notes or support messages. Payment and delivery arrangements between users must be agreed and recorded by the parties.</p>
    <h2>Safety, incidents and disputes</h2><p>Users should report safety incidents and preserve truthful records. Platform incident review is not a substitute for emergency services, legal advice, insurance claims, or professional dispute resolution. Contact emergency services first if anyone is in immediate danger.</p>
    <h2>Availability and account action</h2><p>The service may be changed, interrupted or withdrawn during testing. We may restrict accounts or content to protect users, the integrity of the marketplace or service operations. Nothing in these terms excludes liability where it cannot lawfully be excluded.</p>
    <h2>Contact and updates</h2><p>These terms are a testing draft and must be reviewed by qualified counsel in every intended launch market before commercial launch. Local consumer, commercial, transport, insurance, privacy and subscription requirements may differ by country and, where applicable, state, province or territory. The version accepted at signup is recorded with the account. Material changes should be published and presented for renewed acceptance where required.</p>
  </main>;
}
