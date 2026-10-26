# Post2Drive Application Map: Screens, Workflows, Pricing and Dashboards

**Purpose:** This is the portable product map for developers, reviewers and future owners. It records intended end-to-end user journeys, major application areas, commercial decisions, customer dashboards and internal owner analytics. It separates documented intent from implemented and verified behaviour.

**Status:** Product/workflow specification. It does not assert that every workflow or dashboard is complete, deployed or launch-ready. For each item, check current source, tests, open PRs and staging evidence before marking it implemented.

## 1. Product roles and account model

Post2Drive is a two-sided courier, delivery and freight marketplace for the UK, India and supported European markets.

A person may use the same account to:
- **Post jobs** as a customer, shipper or business.
- **Carry jobs** as a driver, courier or transport/fleet operator.
- **Do both** and switch between permitted poster and driver activities.

Initial role selection guides onboarding; it is not proof of verification, payment or eligibility and should not permanently prevent a user adding a legitimate second role. Keep identity, company, vehicle, market, subscription, payment and activity permissions separate.

## 2. End-to-end user journey

### A. Discover and register
1. Public visitor reads the marketplace value proposition, supported markets, pricing and terms.
2. Selects the account market/country and intended role: post, carry or both.
3. Creates an account and completes required account security steps that are actually configured.
4. Accepts applicable terms/privacy notices and records the accepted version.
5. Completes the profile and sees a clear checklist of required verification and paid access.

Email verification and SMS/OTP must be described according to actual environment configuration; do not promise delivery while a provider is disabled or unverified.

### B. Person and company verification
1. User submits required person identity evidence.
2. If the chosen activity/business relationship requires a company, user submits company details and evidence.
3. Show status, missing information, next action and deadlines.
4. Pending/failed checks block only activities requiring that approval; unrelated permitted features may remain available.
5. Driver-only users may skip the Step 2 posting fee and poster subscription, but cannot skip mandatory identity or applicable company checks.

See Product and Verification Policy for exact fees, retry windows, exemptions and 90-day return rules.

### C. Posting a job
1. User opens the poster workspace and confirms poster entitlement and required identity/company approval.
2. Creates a job with pickup/drop-off, date/time and timezone, vehicle requirements, load details, price, currency and relevant notes.
3. Server validates market/currency, required fields, vehicle compatibility, date/time validity and permission to post.
4. Job becomes discoverable only under configured visibility and market rules.
5. Poster reviews job status, bids, assigned driver, lifecycle events, cancellations and relevant notifications.
6. Editing, cancelling or reopening follows lifecycle and assignment constraints; important state changes must be authorized and auditable.

### D. Driver discovery and bidding
1. Driver sees verification checklist, driver subscription/trial state and eligible vehicles.
2. Marketplace returns only jobs in the permitted market and matching at least one eligible vehicle and required capabilities.
3. Driver opens a job, reviews details and bids or uses direct acceptance only where that workflow is enabled and permitted.
4. Server rechecks identity, company where applicable, active driver entitlement, vehicle eligibility, insurance/MOT/other mandatory documents, job state and market isolation at action time.
5. Poster reviews bids and awards/accepts one; competing bids and stale job states are handled safely.
6. A failed/expired vehicle is excluded; another compliant vehicle may remain available. Subscription never overrides failed mandatory checks.

### E. Job fulfilment and closure
The exact lifecycle transitions must be confirmed against current enums/API and documented tests. Intended journey:
1. Job posted/open.
2. Bid(s) received and reviewed, or eligible direct acceptance where supported.
3. Job assigned/accepted.
4. Pickup and delivery progress recorded with permitted confirmations/evidence.
5. Completed/delivered, or cancelled/rejected/disputed according to allowed transitions.
6. Ratings, notifications, activity history and analytics update without duplicate event counting.

Every transition must enforce participant/role ownership, current status, same-market policy, idempotency/concurrency rules and auditability. Client-supplied IDs must not bypass ownership checks.

### F. Vehicles and fleet management
- Add a vehicle with type/capacity/registration and required ownership/document details.
- Verify each vehicle separately; track MOT/inspection and insurance expiry and any market-specific required licence/document.
- Display status, expiry warnings and a resubmission path.
- Adding a vehicle while on an active paid plan has no verification fee under the owner-specified policy, but all checks still apply.
- One vehicle's failure must not disable another independently eligible vehicle.
- Fleet/company relationship changes follow the separate fee policy; changing a responsible person within the same company is free, but a new company relationship incurs applicable verification fees.

### G. Subscriptions, trial and payments
- Show exact plan, feature(s) unlocked, price, currency, duration, start/end, renewal behaviour, payment status and cancellation/expiry behaviour before purchase.
- Verification success alone does not activate a trial or paid subscription.
- Subscription/payment success must come from trusted provider confirmation, not a client assertion.
- Do not label payment as settled revenue until reconciled with provider-confirmed settlement.
- A paid plan does not override a failed person/company/vehicle check.
- The intended distinction between poster and driver access must be enforced server-side; a single generic account subscription flag is insufficient if feature entitlements differ.

**Important commercial decision conflict:** existing repository README/launch-readiness notes describe UK and euro weekly access: individual £9.99 for 7 days; fleet £16.99 (2–5 vehicles), £24.99 (6–15), £36.99 (16–30), £49.99 (31–55), and custom pricing for 56+; no automatic recurring billing and no per-job fee. The more recent product discussion proposes poster £9.99/month and driver £9.99/week. These models are not equivalent. Until the owner approves one canonical pricing matrix and market mapping, record both as conflicting, do not silently overwrite source pricing, and do not advertise the newer proposal as live.

### H. Verification charges and exceptions
The owner-specified target amounts are recorded in Product and Verification Policy:
- Step 2 person and applicable company verification: £2.50.
- Step 3 person/driver and first vehicle with required MOT/insurance checks: £3.50.
- Each additional vehicle during initial verification where chargeable: £0.50.
- No refunds.
- First failed review: 10 working days to submit corrected documents; next failed review: final 3 working days; after another failure, a new attempt fee applies subject to active-paid-plan maintenance exemption.
- Within 90 calendar days from successful verification, return checks are free even if documents expired; current evidence must still pass.
- Active paid-plan routine rechecks and vehicle additions are free.
- Changing responsible person within the same company is free; a new company relationship incurs applicable fee.
- Driver-only users skip the Step 2 posting fee, not required identity/company verification.

Implementation must avoid double-charging the same person check when Step 3 reuses a still-valid check. The interaction between the £2.50 and £3.50 packages must be explicit in checkout, server logic and tests.

## 3. Customer-facing dashboard requirements

The signed-in user dashboard is different from the internal app-owner analytics dashboard. It should expose only data the current account/user is authorized to see.

### Shared account home
- Current role/context switch: post, carry, or both.
- Account security and verification status with clear next action.
- Market/country and currency displayed as stored account values.
- Subscription/trial state and feature-specific access, next expiry and payment history where supported.
- Notifications, recent activity and unresolved actions.
- Help/support, terms/privacy and account deletion controls.

### Poster/customer dashboard
- Active, draft/open, assigned, in-progress, completed and cancelled jobs.
- Job details, edit/cancel actions where valid, bid counts and bid review/award actions.
- Lifecycle progress, relevant driver/vehicle information, notifications if implemented, evidence and incident/dispute state if available.
- Personal activity analytics: jobs posted, jobs completed, cancellation rate, average time to first bid, bid volume and completion trends only when reliable events exist.
- Exports must be scoped to the user's own data and avoid exposing other users' private information.

### Driver/courier dashboard
- Driver verification and each vehicle's eligibility, document expiry, failure reasons and correction deadline.
- Job discovery, saved/recent opportunities where implemented, active bids, awarded/accepted work, in-progress jobs and completed history.
- Driver subscription/trial entitlement and renewal/expiry status.
- Personal activity analytics: eligible opportunities seen, bids, acceptance/conversion, completed jobs, cancellations and ratings where instrumentation supports them.
- Show why a vehicle/action is ineligible without exposing private reviewer notes or another account's data.

### Fleet/company dashboard
- Verified company identity and authorized responsible-person relationship.
- Vehicle list and per-vehicle verification/document expiry.
- Fleet size/plan band and entitlement state.
- Team/driver assignments only if multi-user/team permissions exist in actual product; do not imply those capabilities exist merely because the company is a fleet.
- Fleet analytics: active eligible vehicles, job pipeline, completion/cancellation and utilization only when supported by reliable data.
- Company changes require clear ownership and verification handling; new company relationship follows the fee policy.

### User analytics principles
- Analytics are private to the relevant account, role and authorized team.
- Distinguish counts of account records from counts of user profiles.
- Explain time window, timezone, metric definition and data freshness.
- Display “not enough data” rather than invented rates for sparse histories.
- Keep personal analytics separate from internal platform-wide analytics.

## 4. App-owner / internal operations analytics dashboard

The internal dashboard is a separate privileged operations tool, not the customer-facing dashboard. A detailed specification already exists in Analytics Dashboard Product Spec. The owner/admin dashboard should provide these areas, with every metric backed by a documented query and clear freshness/coverage:

1. **Command centre:** total accounts/profiles, new/active accounts, market breakdown, jobs, verification backlog, service health and high-priority exceptions.
2. **Marketplace:** jobs posted/open/assigned/in-progress/completed/cancelled, bids, bid-to-accept conversion, jobs with no bids, time to first bid/accept, completion and cancellation trends.
3. **People and trust:** poster/driver/both account mix, identity/company/vehicle verification states, review queue, failure reasons and correction deadlines, access blocks, moderation and incident reports.
4. **Commercial:** configured plan catalogue, subscriptions/trials, expiry/churn/conversion, payment attempts/failures/refunds where available. Distinguish recorded payment intent, provider-confirmed settlement, refunds and reconciled revenue.
5. **Vehicles and supply:** verified/eligible vehicle counts by market/type, document expiry, vehicle ineligibility, supply/demand ratios and coverage.
6. **Job operations:** stuck transitions, unassigned/aged jobs, lifecycle errors, cancellation reasons, disputes/incidents and notification failures.
7. **Growth and retention:** new/active/reactivated accounts, cohorts, retention, role conversion, onboarding completion and market-specific trends where events support them.
8. **QA and engineering:** CI runs, regression suite outcomes, test campaign history, synthetic account/API/workflow volumes, failures by scenario/market, retained evidence and deployment SHA.
9. **Service health:** API volume, latency percentiles when measured, 4xx/5xx trends, health, deployments, incidents and database connectivity.
10. **Country comparison and market intelligence:** market filter, comparison, time windows, previous-period deltas, external industry signals only when sourced and dated.
11. **Audit and governance:** admin actions, changes to prices/plans/verification decisions, access grants, exports, configuration changes and ownership/deployment history.
12. **Data catalogue:** metric name, definition, source query/table/event, currency/unit, timezone, aggregation, exclusions, freshness and known limitations.

### Internal dashboard access and privacy
- Require explicit admin/owner authentication and least privilege. Never expose an unprotected public dashboard.
- Use a dedicated read-only database role or narrow server-side metrics API; no write/delete privileges for reporting.
- Exclude synthetic QA accounts from business totals but retain them in QA analytics.
- Do not expose secrets, raw verification documents, passwords, tokens or unnecessary PII in charts/exports.
- Aggregate small cohorts to reduce re-identification risk.
- Dashboard recommendations are advisory unless a separately authorized admin action is explicitly initiated.
- Admin changes require audit logging and appropriate authorization; analytics viewing must not implicitly modify marketplace records.

## 5. Admin operations beyond analytics

Separate operational tools from read-only analytics:
- Review person/company/vehicle verification submissions and record decision, reason and deadlines.
- Review reports/incidents, moderation and disputes.
- Manage authorized admin access, tester access and guarded QA runs.
- Review account lifecycle/deletion requests and data retention.
- Inspect deployment/health/CI/incident evidence.
- Change plan prices, fee rules, promotions or market availability only through an authorized, audited configuration path and after product approval.
- Preserve auditable history of critical decisions and payment/verification events.

A dashboard that only displays data is not a substitute for a secure admin workflow. An operational admin page should not have unrestricted write access merely because it is internal.

## 6. Market and pricing source of truth

- The user's stored market/country and currency are server-authoritative. UI filters are for reporting only and must not change the account market.
- UK/GB uses GBP; India uses INR; supported euro markets use EUR according to current market configuration. Recheck the supported-country list in code and launch-readiness docs.
- Cross-border matching is currently documented as disabled unless explicitly changed and tested.
- Every displayed price must identify currency, duration, what it unlocks, whether it recurs, and whether tax is included where applicable.
- Keep separate catalogues for subscription prices, verification fees, fleet bands, promotional/free-trial rules, referral rewards and any job/transaction fees. Do not conflate them.
- Use one canonical pricing/configuration source and contract tests to ensure UI, APIs, checkout and documentation agree.
- If a price or policy is unresolved, mark it “decision required” rather than guessing.

## 7. Notifications and communications

Document and test each event, recipient, channel and retry policy for: account/security changes, verification status/failure/deadline, document expiry, subscription/payment outcomes, bids, award/acceptance, pickup/delivery changes, cancellation, incident/dispute and admin action. Only claim email/SMS/push delivery after provider setup and end-to-end evidence. Failed delivery must be observable; retries must be idempotent and must not disclose private details.

## 8. Required behaviour and regression coverage

At minimum:
- Role switching and adding a second role without losing account history.
- Step 2 driver-only fee skip while still requiring applicable verification.
- Step 2/Step 3 package pricing and no duplicate identity charge.
- No refunds; exact 10-working-day and 3-working-day correction windows.
- 90-calendar-day return check, including expired documents, day-90 boundary and timezone.
- Active paid-plan free rechecks and vehicle additions, while failed mandatory checks block affected actions.
- Same-company responsible-person change free; new company relationship charged.
- Poster, driver and fleet dashboards isolate data to authorized account/team.
- Failed vehicle blocked while other eligible vehicles remain usable.
- Expired subscription blocks only subscription-gated actions; verification alone does not grant access.
- Every job lifecycle transition, bid race, duplicate request and cross-market attempt.
- Admin dashboard read-only boundary, authentication, privacy, market filters, QA exclusions, metric correctness and audit trail.
- Every chart has defined empty/stale-data handling and matches its source query.

## 9. Current-state inventory and gap tracking

For each capability, record four states separately:
- **Specified:** documented desired behaviour.
- **Implemented:** source code exists.
- **Tested:** automated and/or manual behaviour has been verified on an identified commit.
- **Deployed:** exact commit is running in the named environment and smoke/E2E evidence exists.

Use this checklist as a release-review starting point, not as an assertion of completion:

| Area | Required evidence / current caution |
| --- | --- |
| Signup/login and role onboarding | Verify current routes, email/phone provider state and role switching. |
| Person/company/vehicle verification | Target policy is documented; inspect schema, fee collection, review tools and tests for gaps. |
| Job posting, discovery, bidding and fulfilment | Verify every API transition and market/ownership check. |
| Subscription/checkout | Pricing model has a documented conflict; provider settlement is not confirmed live. |
| Customer analytics/dashboard | Specify metrics and role-specific visibility; verify each screen in source and browser E2E. |
| Internal owner analytics | Existing analytics spec is detailed; confirm service deployment, current database target, read-only role and metric correctness. |
| Admin operational actions | Verify authentication, permission checks, audit logging and separation from read-only reporting. |
| Notifications | Provider configuration and end-to-end delivery need explicit evidence. |
| QA/deploy/rollback | Preserve QA history, exact SHA, CI evidence, backup/restore and rollback results. |
| Legal/privacy/support | Publish and verify market-appropriate policies before launch. |

## 10. Maintenance rule

Whenever a screen, endpoint, workflow, plan price, verification condition, role permission, analytics metric or infrastructure service changes:
1. Update this map and the focused policy/spec.
2. Update the README links if a new core document is added.
3. Add tests and record source paths/metric definitions.
4. Update implementation status only with evidence for the exact commit.
5. Record deployment SHA and environment only after confirming live state.
6. Preserve unresolved product decisions as explicit blockers.
