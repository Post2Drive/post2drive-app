# Product, account and verification policy

**Document status:** Product policy for implementation and review. This document records owner-specified intended behaviour; it does not claim every rule is implemented in code or enabled in a live environment. Where a rule conflicts with current application behaviour, this document describes the target and the discrepancy must be tracked as implementation work.

## 1. Product purpose

Post2Drive is a two-sided courier, delivery and freight marketplace for the UK, India and supported European markets. Customers and businesses publish delivery jobs; drivers, couriers and transport/fleet operators discover suitable jobs, bid or accept where allowed, and fulfil deliveries.

One account may support posting, carrying jobs, or both. Role choice selects an onboarding path; it should not permanently lock a user into one role or require a second account to add a legitimate activity later. Market/country and currency isolation remain server-enforced and separate from role selection.

## 2. Three-step onboarding

### Step 1 — create an account

- Registration is free.
- User chooses an intended path: **post jobs**, **carry jobs**, or **both**.
- Role selection is an onboarding preference, not proof of identity, company status, vehicle eligibility, subscription, or permanent role restriction.
- Registration alone must not unlock restricted posting, bidding, acceptance or fulfilment actions.

### Step 2 — person and applicable company verification

- The person must pass required identity verification before performing restricted marketplace activities.
- If the activity/account requires a company, the company relationship and relevant company details must also pass checks.
- A user who only wants to drive/carry jobs may skip the Step 2 **posting fee and poster subscription**. They may not skip required identity verification or applicable company checks.
- A user choosing to post jobs pays the Step 2 verification fee and needs the relevant poster trial/subscription entitlement before posting.
- Company verification is conditional on the activity and business relationship; do not require company verification universally for a person who is not operating as a company unless a specific rule requires it.

### Step 3 — driver and vehicle verification

- Driver/fleet users submit the information and documents required for each vehicle, including MOT/inspection and insurance where applicable in the market.
- Each vehicle is independently eligible or ineligible. One failed vehicle must not automatically disable another vehicle that remains compliant.
- Passing verification does not activate a subscription. Driver discovery, bidding, acceptance and fulfilment require both appropriate verification and the relevant trial/paid entitlement.
- A vehicle with expired or failed mandatory documents must not be used for restricted driver activities until the required checks pass.

## 3. Verification fees (GBP reference policy)

These are owner-specified target amounts. Local market/currency handling must be designed explicitly before applying them outside GBP.

| Verification package | Fee |
| --- | ---: |
| Step 2 person verification, with applicable company verification where needed | £2.50 |
| Step 3 person/driver plus first vehicle package, including required MOT and insurance checks | £3.50 |
| Each additional vehicle during initial verification, where the fee applies | £0.50 |

Verification charges are separate from subscription charges. The intended package model is £2.50 for Step 2 and £3.50 for Step 3; the Step 3 package includes person/driver and first-vehicle checks. Implementation must reuse an existing valid person check where appropriate and must not silently charge twice for the same check without an explicit approved fee schedule.

**Fee exemptions and new relationships:**

- No refunds are issued for verification fees, including after an unsuccessful outcome.
- An active paid-plan user pays no fee for timely routine rechecks needed to maintain existing eligibility.
- An active paid-plan user pays no fee to add vehicles; all required vehicle checks still apply.
- Changing the responsible person within the same company carries no new verification fee; the replacement person still has to pass identity checks.
- A person connecting to a different/new company incurs the applicable new-company verification fee, even if the person was previously verified.
- A person changing from a company account to a genuinely new sole-person/no-company account is treated as a new account relationship and is subject to the applicable initial fee. Account/identity linking must prevent duplicate-account abuse.
- New-account and initial additional-vehicle fees must not override the explicit free-addition rule for an active paid-plan user.

## 4. Failed verification and correction windows

- **No refunds.**
- After the first failed review, give the user **10 working days** to submit updated/corrected documents.
- After the next failed review, give the user **3 working days** as a final correction window.
- If verification fails again after these correction opportunities, the next new verification attempt requires the applicable fee, except where the active-paid-plan maintenance exemption applies.
- Pending or failed mandatory checks block the activities that require them. Subscription status never overrides identity, company, vehicle, insurance or MOT requirements.
- Store the failure reasons, attempt number, timestamps, correction deadlines, fee status and reviewer outcome. Use server time and explicit deadline semantics; display the deadline clearly.
- The exact count of initial review vs correction review must be represented consistently in UI, API, database and tests. Do not create a new fee merely because a user submitted corrected evidence within an allowed correction window.

## 5. Free rechecks and inactivity

### 90-day return window

The free return window is **90 calendar days from the timestamp of successful verification**, not “three calendar months” and not 90 working days.

If the user returns within that window, verification checks are free even when MOT, insurance or other documents have expired. Free means the checks/review are not charged; it does not mean expired documents are accepted or that the vehicle is automatically eligible. The user must supply current documents and the outcome follows the findings of the verification.

The 90-day rule waives verification fees only. It does not restart or extend a trial, subscription, or access period.

### Active paid plan

For an active paid-plan user, routine rechecks to maintain existing verified relationships are free, including checks after a document expires. The user must still correct the issue and pass all required checks. Failure blocks the affected activity; it does not generate a routine recheck fee while the exemption applies.

A failed check is not permission to operate. If one vehicle fails, other independently compliant vehicles may remain usable. Identity failure blocks restricted activities dependent on that identity; company failure blocks activities requiring that company; vehicle document failure blocks the affected vehicle.

### Outside the 90-day window

For an inactive user who is not covered by the active-paid-plan exemption, the free-return window ends after 90 calendar days. Any new verification fee must follow the applicable package and new-relationship rules. A new company relationship is chargeable under its own rule even within a recheck window unless the owner explicitly changes that policy.

## 6. Subscriptions and access

The prices below are previously discussed commercial proposals, not evidence of a live payment provider or approved billing configuration:

- Poster: £9.99/month.
- Driver: £9.99/week.
- Market-specific pricing, currencies, trial duration and entitlements must be confirmed in configuration before launch.
- Step 2 posting payment is optional for driver-only users. It is not optional for users choosing the posting route where the fee applies.
- A user who wants both posting and driving must have the appropriate entitlement for each activity. Avoid accidental double charging when a driver plan includes posting access only if that inclusion is explicitly approved and implemented.
- No real payment may be collected until a provider, authenticated webhook/signature validation, idempotency/replay handling, settlement reconciliation, failures, cancellations and refunds are implemented and end-to-end tested.
- Never represent a pending payment record or internal confirmation endpoint as proof of provider settlement.

## 7. Access decisions by failed check

| Failed check | Restriction |
| --- | --- |
| Person identity | Block restricted actions that depend on verified identity, across roles |
| Company/business | Block activities that require that company to be verified; allow unrelated compliant activities where safe |
| One vehicle's MOT, insurance or mandatory document | Block that vehicle for affected driver actions; keep other eligible vehicles available |
| Customer/poster-specific mandatory check | Block the activity requiring that check; do not apply irrelevant vehicle restrictions to a customer who is not driving |
| Routine recheck while on active paid plan | No repeat verification fee; still block the activity governed by a failed check |
| Subscription inactive/expired | Verification remains recorded, but subscription-gated features remain unavailable |

The same risk-based principle applies to courier-style (CX-like) and haulage/fleet-style (HX-like) marketplace workflows. This describes Post2Drive's intended rules; it is not a claim about another platform's private policy.

## 8. Data model and implementation requirements

Keep these concepts independent in the database and service layer:

1. Person identity verification and its validity/history.
2. Company verification, tied to a stable company identity/relationship.
3. Vehicle verification and per-document expiry.
4. Verification attempts, findings, correction deadlines, fee amount/currency/status, and exemption reason.
5. Subscription/trial entitlement by feature (posting vs carrying), separate from verification.
6. Successful verification timestamp and 90-calendar-day return-window deadline.
7. Audit history for relationship changes, waived fees, failures and access decisions.

Avoid a single account-level verified boolean as the sole authority for every action. Server-side checks must be used for job creation, browsing, bidding, direct acceptance, award/acceptance, and vehicle-specific activity. Use transactions/idempotency where payments or state changes race.

## 9. Required test cases

- Driver-only onboarding skips the Step 2 posting fee but cannot bypass required person/company verification.
- Posting path requires Step 2 fee policy and poster entitlement.
- Person+company Step 2 package charges once; Step 3 package does not silently duplicate a valid person check.
- First failure opens a 10-working-day correction window; next failure opens a 3-working-day final window; later retry fee is enforced only when applicable.
- No refund is issued on failure.
- Return on day 90 is free; return after day 90 is outside the free-return window. Test calendar-day boundaries and timezone handling.
- Within 90 days, expired documents are rechecked free but remain ineligible until renewed/approved.
- Active paid-plan rechecks and vehicle additions are free; failed mandatory checks still block the affected activity.
- Changing responsible person within the same company is free; a new company relationship is chargeable.
- One failed vehicle does not disable another eligible vehicle.
- Poster/customer account is not blocked solely by an unrelated vehicle check.
- Subscription expiry never overrides failed identity/company/vehicle checks; successful verification never creates subscription entitlement by itself.
- UK/India/European market isolation and currency rules remain enforced.

## 10. Decision and status discipline

This document captures the target policy and owner decisions. Before claiming it is live, link the implementation PR, migrations, automated tests, exact CI status, staging behaviour and release evidence. Any unresolved pricing interpretation or market-specific rule must be flagged for owner decision rather than invented.
