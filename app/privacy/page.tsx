import Link from "next/link";

export default function PrivacyPage() {
  return <main style={{ maxWidth: 900, margin: "0 auto", padding: "32px 20px 64px" }}>
    <p><Link href="/signup">← Back to signup</Link></p>
    <h1>Post2Drive Privacy Notice</h1>
    <p><strong>Version:</strong> 16 October 2026 · Draft for product testing</p>
    <p>This notice describes the categories of information used by the Post2Drive development service. It is a working notice and must be reviewed against the final hosting, analytics, email, verification and payment providers before public launch.</p>
    <h2>Information we use</h2><p>Account details (name, email, phone, business name, country, currency and plan), authentication and verification data, vehicle and job details, bids, lifecycle records, ratings, notifications, incident reports and evidence, audit/operational metrics, and support or moderation records. If you choose to complete the optional India-market research questions, those answers are saved against your account to help design the product.</p>
    <h2>Why we use it</h2><p>We use this information to create and secure accounts, display same-market delivery opportunities, coordinate accepted jobs, protect contact details until a job is matched, prevent abuse, review incidents, administer access plans, and improve reliability. Optional market research is not required for marketplace access.</p>
    <h2>Sharing and access</h2><p>Some details are shared with the other party to a delivery only when needed for an accepted job. Public job browsing should not expose direct contact details. Authorised administrators may access limited operational or incident information for support, security and moderation. Service providers may process data on our behalf when configured.</p>
    <h2>Security and retention</h2><p>We use access controls, password hashing, private configuration, audit records and market isolation as applicable. No internet service can guarantee absolute security. Operational and transaction records may be retained to protect other users, investigate disputes or meet legal obligations; we aim to minimise identifiable information and retention where practical.</p>
    <h2>Your choices</h2><p>You can update profile details and your marketing preference in Account Settings. You can request account deletion there; the workflow is designed to disable access and anonymise personal details while preserving limited job/audit records needed for other participants. Contact us if you need access, correction or privacy support.</p>
    <h2>Market and launch status</h2><p>Country and currency are selected at signup and cannot be freely changed because job visibility is restricted to that market. Email verification, SMS/OTP, payment processing, analytics and any other provider integration should be enabled only after the relevant provider and notice details have been verified.</p>
    <h2>Contact</h2><p>Before launch, add the final legal operator name, registered address, privacy contact, applicable supervisory authority information and verified provider list. This document should be reviewed by qualified counsel before being relied on as the final legal notice.</p>
  </main>;
}
