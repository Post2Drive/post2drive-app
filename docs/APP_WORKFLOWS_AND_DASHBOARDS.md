# Post2Drive — Product Purpose and Core Workflows

**Purpose:** Explain what Post2Drive is for, why its main product areas exist, and what each is responsible for. This is a durable product overview for anyone cloning, maintaining or taking over the repository; it is not a screen-by-screen specification.

**Status discipline:** This document describes intended product behaviour. It does not prove that a feature is implemented, tested or deployed. Confirm the current source, tests and staging evidence before making that claim.

## 1. The main goal

Post2Drive is a two-sided marketplace connecting people or businesses that need deliveries with drivers, couriers and transport/fleet operators who can carry them.

The product should make it straightforward to:
- Post a delivery job and find a suitable carrier.
- Help drivers discover suitable jobs, bid or accept where allowed, and complete the work.
- Manage identity, companies, vehicles and documents so only eligible users and vehicles perform restricted activities.
- Give each user a clear view of their own work and account status.
- Give the app owner a trustworthy view of marketplace performance, safety, commercial activity and technical health.

The UK, India and any other supported markets must remain correctly separated by the account's stored market and currency. Do not assume every market, payment method or legal requirement is already live.

## 2. Main product areas — what they are for

### Accounts and onboarding
**Goal:** Let a person register once and choose to post jobs, carry jobs, or do both.

Registration establishes an account; it does not itself prove identity, company status, vehicle eligibility or paid access. Users should be guided through only the verification and access steps relevant to their activities.

### Identity, company and vehicle verification
**Goal:** Protect the marketplace and make eligibility understandable.

Person identity, applicable company checks and each vehicle's documents are separate concerns. A failed vehicle should not automatically block another eligible vehicle or an unrelated poster activity. Subscription status must never override a mandatory failed check.

The exact verification fees, no-refund rule, correction deadlines, 90-calendar-day return window and exemptions are maintained in [Product, Account and Verification Policy](PRODUCT_AND_VERIFICATION_POLICY.md). That document records target policy, not proof that every rule is implemented.

### Job posting and marketplace discovery
**Goal:** Turn a delivery need into a job that suitable carriers can find.

Posters describe the delivery, timing, location, vehicle requirements and price. Drivers should see only jobs they are permitted and able to take. Server-side checks must enforce ownership, job status, market isolation, role entitlement and vehicle eligibility—not rely on the interface alone.

### Bids, acceptance and delivery lifecycle
**Goal:** Coordinate the job from interest to completion while preserving a reliable history.

The app must handle bids or supported direct acceptance, assignment, progress, completion, cancellation and relevant incidents. Each state change must be authorized, valid for the current job state, safe against duplicate/racing requests, and visible to the right participants.

### Vehicles and fleet management
**Goal:** Keep carrier capability and compliance up to date.

Users manage vehicles and the documents required for their market. Eligibility is vehicle-specific, expiry should be visible, and a document failure should restrict the affected vehicle rather than unrelated compliant activity.

### Subscriptions, verification charges and payments
**Goal:** Explain what access costs, what a payment covers, and whether a user is currently entitled to a feature.

Verification charges and subscription charges are different. Prices, duration, currency, included features, trial rules, renewal behaviour and expiry must agree across policy, UI and server logic. A successful verification is not a subscription; a recorded payment is not proof of provider settlement.

**Pricing decision required:** Repository launch-readiness notes describe individual UK/euro access at £9.99 for 7 days and fleet bands (£16.99 for 2–5 vehicles, £24.99 for 6–15, £36.99 for 16–30, £49.99 for 31–55, custom for 56+), with no automatic recurring billing or per-job fee in that documented model. A later proposal describes poster access at £9.99/month and driver access at £9.99/week. These models conflict. Do not silently choose one, advertise it as live or implement a new billing model until the owner approves one canonical price/entitlement matrix.

### Notifications and account support
**Goal:** Tell the right person when they need to act.

Important events include verification decisions and deadlines, document expiry, bids, acceptance, job progress, cancellation, payment/subscription changes and incidents. Delivery channels must be described honestly: an email, SMS or push notification is only confirmed working after provider setup and end-to-end testing.

## 3. User dashboards — why they exist

User dashboards help people understand **their own account, what needs attention, and what they can do next**. They are not the app-owner analytics system.

- **Poster/customer view:** manage own jobs, review bids, follow delivery progress and see completion/cancellation history.
- **Driver/courier view:** find eligible jobs, manage bids and active work, see vehicle/document status and understand access or verification blockers.
- **Fleet/company view:** understand company status, vehicle eligibility and fleet-related work, only to the extent supported by actual team permissions.
- **Shared account view:** show role, market, verification, subscription/entitlement, notifications and next required action.

Personal analytics can summarize useful activity—such as jobs, bids, completions, cancellations or response times—when reliable data exists. Show definitions and date ranges, protect other users' information, and display “not enough data” instead of inventing metrics.

## 4. App-owner dashboard — why it exists

The internal owner/admin dashboard exists to answer: **Is the marketplace growing, functioning safely, converting jobs, earning what records actually support, and operating reliably? Where does someone need to intervene?**

Its main responsibilities are:

- **Marketplace health:** accounts, job supply and demand, bids, jobs without bids, acceptance and completion trends.
- **Trust and verification:** identity/company/vehicle review queues, failures, deadlines, incidents and compliance-related blockers.
- **Commercial visibility:** configured prices/plans, subscriptions, trial/expiry patterns and payment outcomes. Separate payment attempts from provider-confirmed settlement and reconciled revenue.
- **Operations:** stuck jobs, lifecycle errors, cancellations, notification failures and issues needing attention.
- **Growth and market comparison:** active/new users, retention and market-by-market trends when the underlying data supports them.
- **QA and engineering:** CI/regression results, synthetic test runs, failures, deployments, service health and exact commit evidence.
- **Audit and data definitions:** privileged actions, configuration changes, source and meaning of each metric, freshness, exclusions and known gaps.

A more detailed specification is maintained in [Analytics Dashboard Product Spec](ANALYTICS_DASHBOARD_PRODUCT_SPEC.md). It is a product specification, not proof that the separate analytics service is deployed or that every data source is connected.

### Owner dashboard safety rules
- Protect it behind explicit admin/owner authentication and least-privilege access.
- Prefer a read-only reporting role or narrow server-side metrics API; analytics must not have database write/delete privileges.
- Exclude synthetic QA data from real marketplace totals while retaining it in QA reporting.
- Do not expose passwords, secrets, raw identity documents or unnecessary personal data.
- Label unavailable, stale or incomplete metrics; never fabricate external market data or claim revenue without reconciliation.
- Keep reporting separate from operational admin actions. Changes to accounts, prices, verification decisions or permissions require authorization and audit history.

## 5. Pricing and policy are product behaviour

Commercial rules are part of the product, not just marketing copy. Keep separate and consistent definitions for:
- Subscription plans and the features/duration each unlocks.
- Verification packages, correction windows, exemptions and return-check timing.
- Free trials, promotions, referrals and any future transaction fees.
- Market/currency mapping and any market-specific restrictions.

When policy documents and code disagree, do not hide the discrepancy. Record it as an implementation gap or owner decision. The focused verification policy contains the current target fee and condition details.

## 6. What “complete” means

For each major capability, distinguish:
- **Specified:** its purpose and expected behaviour are documented.
- **Implemented:** the current source contains the behaviour.
- **Tested:** tests or observed staging evidence confirm it on a known commit.
- **Deployed:** that exact commit is running in the named environment and post-deployment checks passed.

This overview is complete enough to preserve the app's main purpose and responsibilities; it is not a substitute for source-level documentation, security review or end-to-end testing.

## 7. Keep this overview current

When the product's core purpose, role model, job lifecycle, verification policy, price/entitlement model or owner analytics responsibilities change:
1. Update this overview and the relevant detailed policy/spec.
2. Keep the README links current.
3. Add or update tests for behaviour that changed.
4. Mark implementation/testing/deployment status only when supported by evidence.
5. Leave unresolved commercial or policy decisions explicitly marked for the owner.
