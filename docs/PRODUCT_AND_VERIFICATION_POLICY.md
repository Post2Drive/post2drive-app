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
| Each additional vehicle, at initial verification **and when added later** (owner decision 2026-11-06) | £0.50 |

Verification charges are separate from subscription charges. The intended package model is £2.50 for Step 2 and £3.50 for Step 3; the Step 3 package includes person/driver and first-vehicle checks. Implementation must reuse an existing valid person check where appropriate and must not silently charge twice for the same check without an explicit approved fee schedule.

**Fee exemptions and new relationships:**

- No refunds are issued for verification fees, including after an unsuccessful outcome.
- An active paid-plan user pays no fee for timely routine rechecks needed to maintain existing eligibility.
- **Superseded 2026-11-06:** adding a vehicle is always charged at the additional-vehicle fee, including on an active paid plan. Reason: a fleet could otherwise verify one vehicle, subscribe, then add the rest free. All required vehicle checks still apply.
- Verification fees for one action are collected in a **single payment** (never a standalone £0.50 card payment, where the card fee would consume a large share of the fee).
- Changing the responsible person within the same company carries no new verification fee; the replacement person still has to pass identity checks.
- A person connecting to a different/new company incurs the applicable new-company verification fee, even if the person was previously verified.
- A person changing from a company account to a genuinely new sole-person/no-company account is treated as a new account relationship and is subject to the applicable initial fee. Account/identity linking must prevent duplicate-account abuse.

## 4. Failed verification and correction windows

- **No refunds.**
- After the first failed review, give the user **10 working days** to submit updated/corrected documents.
- After the next failed review, give the user **3 working days** as a final correction window.
- If verification fails again after these correction opportunities, the next new verification attempt requires the applicable fee, except where the active-paid-plan maintenance exemption applies.
- Pending or failed mandatory checks block the activities that require them. Subscription status never overrides identity, company, vehicle, insurance or MOT requirements.
- Store the failure reasons, attempt number, timestamps, correction deadlines, fee status and reviewer outcome. Use server time and explicit deadline semantics; display the deadline clearly.
- The exact count of initial review vs correction review must be represented consistently in UI, API, database and tests. Do not create a new fee merely because a user submitted corrected evidence within an allowed correction window.

**Implementation notes (2026-11-06):**

- **Working days** are Monday-Friday in the account market's time zone, and a deadline is the end of that local day. UK bank holidays are **not yet excluded**: the official gov.uk list could not be fetched while this was built, so no dates were embedded. Other non-India markets count weekends only.
- **Company reviews follow the same windows.** A failed company review records a correction deadline: 10 working days after the first failure, then a final 3 after the second. Resubmitting the **same** company inside the window is free. A different company, an expired window, or a failure after the final evidence needs a new fee (one pending record). While a review is pending, a different company cannot be submitted until the review is decided.
- **Attempts are counted per account, not per user.** This only matters once member users exist (today one owner per account): a second user's failed person check shares the account's correction cycle.
- **Fees are recorded as pending and do not block approval** until a payment provider is connected. No record is ever marked paid without a verified provider event.
- **Rollout:** existing verified UK accounts with no `phoneVerifiedAt` lose posting (and bid awarding) until they verify their phone by OTP. Tell these users before deploying.

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

## 6. Subscriptions and access — owner-approved matrix (2026-11-06)

Source of truth in code: `lib/pricing.ts`. Pages and APIs must read these values, never hard-code them. Same numbers in each supported non-India market in its local currency. India: free after phone OTP, no verification fee.

| Level | What it allows | Price |
| --- | --- | ---: |
| Poster | Post jobs only. Requires email + phone, then person and company (or sole trader) verification. | £12.99 / month |
| Individual driver | 1 verified person, 1 vehicle. Take jobs **and** post. | £14.99 / 7 days |
| Fleet 2–5 | Company vehicles, responsible person named by the company. Take jobs and post. | £24.99 / 7 days |
| Fleet 6–15 | | £39.99 / 7 days |
| Fleet 16–30 | | £59.99 / 7 days |
| Fleet 31–55 | | £79.99 / 7 days |
| 56+ vehicles | Custom plan | — |

No per-job fees, no commission; the platform never handles job payments between posters and drivers.

### 6.1 One unified account
- Everyone follows the same path: email + phone → person + company (responsible person chosen by the company) → **stop here = poster** | add vehicle(s) with documents → **driver/fleet**.
- Driver-only and fleet-only users skip only the **poster subscription**. They never skip person, company or vehicle checks.
- The driver/fleet plan includes posting and **replaces** the poster plan: one subscription per account, never billed twice.

### 6.2 Poster → driver upgrade
- The account can take jobs as soon as a vehicle passes verification.
- 7 days after successful vehicle verification, billing switches from monthly to the 7-day price.
- Proposed default, pending owner confirmation: unused days of the monthly payment are credited to the first 7-day payment.

### 6.3 Driver → poster, and expired documents (proposed defaults, pending owner confirmation)
- A driver can switch back to poster at the end of the current 7-day period; billing returns to monthly.
- If vehicle documents expire, driving is locked and posting continues; after 14 days without renewal the account moves to poster monthly.

### 6.4 When billing starts (pending owner confirmation)
- Proposed: billing starts on first chargeable use, not at verification. First posted job starts the poster plan; first verified vehicle starts the driver/fleet plan. Nothing is charged while an account is verified but unused.

### 6.5 Fleet tier changes
- Moving between fleet tiers (for example 5 → 6 vehicles) applies from the next 7-day period.

### 6.6 Launch windows (all dates are configuration values, never hard-coded)
- **Month 0 (pre-launch):** posters register and verify only; no live jobs. Each is told the poster window start date. The UK student QA pilot (`uk-market-student-qa`, staging only) runs in this period.
- **Poster window:** posters free for 12 months between a fixed start and end date. After it ends, new posters get 1 month free, then the poster price.
- **Driver window:** drivers and fleets free for the first 3 months of the poster window (fixed dates). The driver window may start later than the poster window.
- **Driver waitlist (during the driver window):** new drivers are admitted per region only while active drivers ≤ 1 × active posters in that region (ratio is configuration). Others join a waiting list.
- After the driver window, there is no free period for new drivers.
- Verification fees apply during launch windows (they also filter fake accounts).
- **How the dates are stored (LaunchConfig):** every window date is an instant in **UTC**. To start a window at UK local midnight, convert it first: 1 January 00:00 UK = `00:00Z` (GMT), but 1 June 00:00 UK = `23:00Z` on 31 May (BST, UTC+1). **End dates are exclusive**: access stops at that instant, so "free through 31 March" is entered as the next day's local midnight. `newPosterTrialDays` is a number of **days** (default 30), not a calendar month. A missing or invalid row disables free windows (fail closed) and is shown to the account and in `/api/promotion/status`; it never falls back to built-in dates.
- **Operating region (known limitation):** the waitlist region is the UK postcode area the account **declares** at signup or in settings. It is self-declared and is not tied to where jobs are actually posted or driven; changing it puts the account at the back of the new area's queue. Waitlist places and active-driver counts include only person-verified, non-deleted accounts with an approved vehicle whose insurance is current.

### 6.7 Fleet integrity rules (closing the "friends form a fleet" loophole)
1. Every fleet vehicle must belong to the company: V5C registered keeper is the company, or a lease/hire agreement is in the company's name.
2. Every fleet vehicle must be insured by the company: a commercial (hire and reward / fleet) policy with the company as policyholder. Insurance review happens once per policy, not once per vehicle.
3. One verified person can be a driver on only one account.
4. Fleet drivers are vouched for by the fleet (licence and right to work are the fleet's responsibility), but every job records which driver (name and licence number) and which vehicle carried it.
5. Owner-drivers using their own vans join as individual drivers; fleets send them work through private job invites.

### 6.8 Payments
- No real payment may be collected until a provider, authenticated webhook/signature validation, idempotency/replay handling, settlement reconciliation, failures, cancellations and refunds are implemented and end-to-end tested.
- Never represent a pending payment record or internal confirmation endpoint as proof of provider settlement.

### 6.9 Transparency before signup
All of §6 that affects what a user pays or must provide — plans, launch offers with exact dates, verification fees, required documents, fleet rules, no-refund wording ("the fee pays for the check, not for passing it"), correction windows, free rechecks and upgrade/downgrade billing — must be visible on `/pricing` and summarised on signup **before** an account is created. Implemented in `components/subscription-pricing.tsx` and `app/signup/page.tsx`.

### 6.10 Implementation status
Enforced in code (release/execution-plan): price constants (`lib/pricing.ts`); separate POST/DRIVE entitlements, Month 0, fixed launch windows from `LaunchConfig`, new-poster trial, driver waitlist by operating region, poster→driver switch with credit, driver→poster at period end, 14-day no-eligible-vehicle fallback (`lib/launchWindows.ts`, `lib/access.ts`); verification order, responsible person, path-based fees, correction windows and free rechecks (`lib/verificationProcess.ts`, `lib/verificationFees.ts`, `lib/verification.ts`); admin vehicle approval, commercial cover, fleet keeper/lease and company-policyholder rules, licence uniqueness, per-job driver and vehicle record (`lib/vehicleApproval.ts`, `lib/driverLicence.ts`, `lib/jobDriverAssignment.ts`); cancellation counting from history (`lib/cancellationPolicy.ts`).
Fee path: an account with no vehicle at verification pays the poster fee; with a vehicle, the driver fee (no poster fee). A verified poster's first vehicle records the one-off driver upgrade fee; later vehicles 0.50 each.
**Operator setup required:** insert the `LaunchConfig` row (dates, trial days, waitlist ratio) — with no row there are no free windows; set `POST2DRIVE_LICENCE_HASH_SECRET` (32+ characters); connect an SMS provider (UK phone verification is now required before verification) and a payment provider (fees and plans are recorded as pending only).
**Not built:** private job invites, account-wide activity log, account health view, ratings hidden during incident review, public replies.

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
- Active paid-plan rechecks are free; adding a vehicle is charged the additional-vehicle fee even on a paid plan; failed mandatory checks still block the affected activity.
- Published prices on /pricing and signup equal `lib/pricing.ts` (enforced by `npm run qa:approved-pricing`).
- Fleet vehicle with a personal registered keeper or a non-company insurance policyholder is rejected for fleet use.
- A verified person cannot be an active driver on two accounts.
- Changing responsible person within the same company is free; a new company relationship is chargeable.
- One failed vehicle does not disable another eligible vehicle.
- Poster/customer account is not blocked solely by an unrelated vehicle check.
- Subscription expiry never overrides failed identity/company/vehicle checks; successful verification never creates subscription entitlement by itself.
- UK/India/European market isolation and currency rules remain enforced.

## 10. Decision and status discipline

This document captures the target policy and owner decisions. Before claiming it is live, link the implementation PR, migrations, automated tests, exact CI status, staging behaviour and release evidence. Any unresolved pricing interpretation or market-specific rule must be flagged for owner decision rather than invented.

## 11. Fair rating policy (owner decision 2026-11-06)

Implemented in `lib/ratingPolicy.ts` (rules), `app/api/ratings/route.ts` (enforcement), `app/api/profile/[id]/route.ts` (display). Tested by `npm run qa:fair-ratings`.

**Lifecycle (unchanged):** either side can confirm pickup; delivery is marked by one side and must be confirmed by the other. A job that cannot continue is ended through the incident process (`incidents/terminate`, or an admin `terminate_with_incident` resolution), which cancels it. Nothing changes a job's status automatically.

**Who:** only the poster and the assigned driver of a job rate each other. Drivers who backed out before pickup are not rated; cancellations are handled by the cancellation limits (`lib/cancellationLimits.ts`).

| What happened | Rating opens | Label |
| --- | --- | --- |
| Delivery confirmed by both | At confirmation | Completed |
| Picked up, then ended through the incident process | When the job was ended | Not completed |
| Marked delivered by one side, never confirmed by the other | 14 days after delivery was marked | Disputed |
| Never picked up (including cancelled or ended before pickup) | Never | — |
| Still in progress | Never while live | — |

- **Window:** a rating can be given for 14 days after it opens.
- **Blind ratings:** a rating stays hidden until the other side also rates, or the window closes.
- **Reasons:** required for 1–2 stars and for every Not completed / Disputed rating, from a fixed list; "Other" requires a comment.
- **Average:** the public star average counts Completed ratings only. Not completed and Disputed ratings are shown separately with their label and reason.

**Not yet built (follow-up):** showing cancellation history on profiles (the cancellation limit currently keeps only the latest canceller per job), hiding ratings while an incident is under admin review, and one public reply per rating. If both parties submit at the same instant, both ratings stay hidden until the window closes (no data loss).

## 12. Notifications and reminders

All notifications are stored in-app (`Notification`) through one helper, `lib/notify.ts`. A repeated `eventKey` is skipped silently, so retries and re-runs never duplicate. After storing, the helper offers the message to an optional push provider (`lib/pushProvider.ts`). **No push, SMS, email or payment provider is connected**; the push interface (`PushNotificationProvider` in `lib/providerContracts.ts`) is structure only and `getPushProvider()` returns `null`.

**Two-party job steps** always notify the other party and say who acted; the actor is never notified:
job accepted (to poster, "by the driver"), bid placed (to poster), bid accepted (to driver, "by the poster"), pickup confirmed by the poster/driver, delivery marked by the poster/driver ("please confirm" to the other side), delivery confirmed, delivery disputed, job cancelled by the poster, driver backed out, driver removed by the poster, incident reported / updated / job terminated by the poster/driver.

**Matching job posted:** when a job is created, up to 200 drivers in the same market are told. A driver qualifies when person-verified, not deleted or suspended, has active drive access (not waitlisted), and has an approved vehicle of the job's type with current insurance and any required inspection. The poster is excluded. Failures never fail job creation.

**Reminders** (`runScheduledNotifications`, using each account's market timezone for "today"/"tomorrow"):
- Vehicle insurance and MOT/inspection expiry: 7 days before, 1 day before and on the expiry day, to the vehicle's owner.
- Free correction deadlines (vehicle, identity check, company): 1 day before.
- Plan billing: 1 day before a chargeable period renews ("Your plan renews tomorrow: <price> will be due") and 1 day before a free window or trial ends. While `PAYMENT_PROVIDER_CONNECTED` is false the wording says "will be due", never "will be charged".

**Scheduler setup:** call `POST /api/internal/notifications/run` once a day (for example a Railway cron) with header `x-scheduler-secret: $POST2DRIVE_SCHEDULER_SECRET`. The route returns 503 when the secret is not set, 401 on a wrong secret, and is rate limited. Running it more often is harmless because every reminder has a unique `eventKey`. No cron service is created by this code.
