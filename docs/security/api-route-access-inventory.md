# API route and method access inventory

**Scope:** `app/api/**/route.ts` on the Post2Drive app `main` baseline (68 route files).  
**Review type:** source-level route inventory. A listed guard is a control observed in the route or its shared helper; it is not a claim that every route has passed a full authenticated adversarial HTTP test. See the evidence matrix below.

## Route inventory

| # | Route | Exported methods | Observed authentication / ownership boundary |
|---:|---|---|---|
| 1 | `/api/account` | GET, PATCH, DELETE | NextAuth session; current account only; bounded/validated mutations, lifecycle concurrency and session-revocation controls; rate limiting where configured. |
| 2 | `/api/account/access` | GET | NextAuth session; account identifier taken from session; reads current account access state. |
| 3 | `/api/account/driver-licence` | GET, POST | NextAuth session; current account only; POST requires a driver/both account with verified person ID, counts every attempt against the rate limit, stores only an HMAC keyed hash (secret required, fails closed) plus last 4, and returns a neutral message for a licence already used on another account. |
| 4 | `/api/account/phone/request` | POST | NextAuth session; sends a code only to the session user's saved number (never a client-supplied number); per-network and per-account rate limits; fails closed when no SMS adapter is available. |
| 5 | `/api/account/phone/verify` | POST | NextAuth session; verifies a six-digit code for the session user's saved number via the account-scoped OTP store (hashed, 5-minute expiry, 5 attempts, atomic single use); per-account rate limit; sets only that account's phoneVerifiedAt. |
| 6 | `/api/account/plan/switch-to-poster` | POST, DELETE | NextAuth session; account identifier taken from session; per-account rate limit; reads no body. POST records the driver->poster switch request for that account only (conditional write, idempotent); DELETE cancels it only before it takes effect. |
| 7 | `/api/account/waitlist` | GET | NextAuth session; account identifier taken from session; evaluates only that account's DRIVE entitlement and regional driver-waitlist position (may record its own waitlist join/admission). |
| 8 | `/api/admin/company-verification` | GET, POST | NextAuth session plus tester-admin authorization; review is limited to GB/GBP submissions and creates an admin audit event. |
| 9 | `/api/admin/driver-licence/release` | POST | NextAuth session plus tester-admin authorization; rate limited and bounded; frees a disputed driving licence by keyed hash, notifies the holder and writes an admin audit event; never returns the hash. |
| 10 | `/api/admin/incidents/resolve` | GET, POST | NextAuth session plus tester-admin authorization; POST validates job/incident/outcome/notes, checks job state, and records the administrator decision. |
| 11 | `/api/admin/performance` | GET | Retired legacy endpoint; returns the replacement admin route rather than the former performance data. |
| 12 | `/api/admin/qa-campaigns` | GET, POST | NextAuth session plus tester-admin authorization; validates draft input; GET is no-store; execution remains staging-guarded. |
| 13 | `/api/admin/qa-campaigns/[id]` | DELETE | NextAuth session plus tester-admin authorization; deletes only the addressed campaign resource. |
| 14 | `/api/admin/qa-campaigns/[id]/start` | POST | NextAuth session plus tester-admin authorization and explicit staging-only QA-runner guard. |
| 15 | `/api/admin/qa-campaigns/access` | POST, DELETE | NextAuth session; same-origin enforcement, request rate limit and configured Ops Dashboard credentials for issuing/revoking the QA-admin cookie. |
| 16 | `/api/admin/research` | GET | Tester-admin authorization; unauthenticated callers receive 401 and non-admin sessions receive 403. |
| 17 | `/api/admin/testers` | GET, POST | Tester-admin authorization; code generation is additionally restricted to the explicit staging environment and writes admin audit records. |
| 18 | `/api/admin/vehicles` | GET, POST | NextAuth session plus tester-admin authorization on both methods; POST is rate limited, bounded, row-locked, re-checks approval rules server-side, writes an admin audit event and notifies the account. |
| 19 | `/api/auth/[...nextauth]` | GET, POST | NextAuth handlers; credential/session policy is enforced by the shared NextAuth configuration. |
| 20 | `/api/auth/forgot-password` | POST | Public entry point; rate-limited and uses a generic response to avoid account enumeration. |
| 21 | `/api/auth/reset-password` | POST | Public token flow; rate-limited, validates/consumes a one-time reset token and revokes existing sessions. |
| 22 | `/api/company-verification` | POST | NextAuth session; GB/GBP-only market gate rejects India before accepting a company-verification submission. |
| 23 | `/api/email/verification/resend` | POST | Public entry point with rate limit and generic response; looks up an email address without confirming account existence. |
| 24 | `/api/email/verify` | POST | Public one-time token flow with rate limiting, expiry/consumption checks and conditional state update. |
| 25 | `/api/health` | GET | Public operational health endpoint; no account data. |
| 26 | `/api/internal/admin-bridge` | POST | Signed bridge request: HMAC-SHA256, timestamp freshness window, nonce format, constant-time signature comparison and persisted replay rejection; QA-sensitive actions remain environment-guarded. |
| 27 | `/api/internal/notifications/run` | POST | Not a user route. Requires the `x-scheduler-secret` header to match `POST2DRIVE_SCHEDULER_SECRET` (constant-time comparison of SHA-256 digests); fails closed with 503 when the secret is unset; rate limited per network identity before the secret check; no request body; runs the idempotent reminder job (vehicle insurance/MOT expiry, correction deadlines, plan renewals) and returns only counts. |
| 28 | `/api/jobs` | GET, POST | NextAuth session; market is derived from the account record, not client country/currency; POST uses bounded JSON, schema/business validation, rate limit and access checks. |
| 29 | `/api/jobs/[id]` | GET | NextAuth session plus job-market guard; only the poster or accepted driver may read the private job detail. |
| 30 | `/api/jobs/[id]/accept` | POST | NextAuth session plus shared job-market guard; driver eligibility and job-state/ownership checks. |
| 31 | `/api/jobs/[id]/activity` | GET | NextAuth session plus shared job-market guard and job-party authorization. |
| 32 | `/api/jobs/[id]/bid` | POST | NextAuth session, job-market guard, request rate limit, driver/vehicle eligibility and open-job state checks. |
| 33 | `/api/jobs/[id]/bids` | GET | NextAuth session plus job-market guard; bids are returned to authorized job parties. |
| 34 | `/api/jobs/[id]/bids/[bidId]/accept` | POST | NextAuth session plus job-market guard; job poster ownership and bid/job association are checked. |
| 35 | `/api/jobs/[id]/cancel` | POST | NextAuth session plus job-market guard; poster ownership and allowed transition are checked. |
| 36 | `/api/jobs/[id]/confirm-delivered` | POST | NextAuth session plus job-market guard; poster/party and delivery-state checks. |
| 37 | `/api/jobs/[id]/confirm-pickup` | POST | NextAuth session plus job-market guard; assigned-driver and lifecycle-state checks. |
| 38 | `/api/jobs/[id]/driver-cancel` | POST | NextAuth session plus job-market guard; assigned-driver and allowed withdrawal-state checks. |
| 39 | `/api/jobs/[id]/edit` | PATCH | NextAuth session plus job-market guard; poster ownership, open-state conditional write and market-derived currency/time-zone validation. |
| 40 | `/api/jobs/[id]/incidents` | GET, POST | NextAuth session plus job-market guard; job-party ownership; incident creation is tied to the addressed job. |
| 41 | `/api/jobs/[id]/incidents/[incidentId]/evidence` | POST | NextAuth session plus job-market guard; job-party check, rate limiting, bounded upload, MIME/signature/filename checks and per-incident limits. |
| 42 | `/api/jobs/[id]/incidents/[incidentId]/evidence/[evidenceId]` | GET | NextAuth session plus job-market guard; evidence is selected through job/incident/evidence identity and restricted to a job party or explicit tester-admin exception; private no-store/nosniff response. |
| 43 | `/api/jobs/[id]/incidents/terminate` | POST | NextAuth session plus job-market guard; incident/job association, party authority and allowed outcome/state transition. |
| 44 | `/api/jobs/[id]/incidents/updates` | POST | NextAuth session plus job-market guard; incident/job association and party authorization. |
| 45 | `/api/jobs/[id]/mark-delivered` | POST | NextAuth session plus job-market guard; assigned-driver and lifecycle-state checks. |
| 46 | `/api/jobs/[id]/payment/confirm-received` | POST | NextAuth session plus job-market guard; assigned-driver and payment-state checks; this is an in-app confirmation, not a provider settlement. |
| 47 | `/api/jobs/[id]/payment/mark-paid` | POST | NextAuth session plus job-market guard; poster and lifecycle-state checks; this is a user marker, not a provider charge. |
| 48 | `/api/jobs/[id]/reject-delivered` | POST | NextAuth session plus job-market guard; poster/party and lifecycle transition checks. |
| 49 | `/api/jobs/[id]/unassign` | POST | NextAuth session plus job-market guard; poster ownership and pre-pickup state checks. |
| 50 | `/api/notifications` | GET | NextAuth session; query and unread count are scoped to the signed-in account ID with selected response fields. |
| 51 | `/api/notifications/[id]/read` | POST | NextAuth session; update predicate includes both notification ID and the signed-in account ID; foreign record returns not-found. |
| 52 | `/api/notifications/read-all` | POST | NextAuth session; marks all unread notifications for the signed-in account as read in a single bulk update; rate-limited per account (60/hour). |
| 53 | `/api/payments` | GET | NextAuth session; account/market-scoped completed jobs and response allowlist; private no-store response. No live payment-provider settlement is implied. |
| 54 | `/api/phone-otp/request` | POST | Public; India only. Sends a code only to a number already on exactly one India account; identical reply whether or not the number is registered (cooldown included); per-network and per-number rate limits; fails closed (503) without an SMS adapter. |
| 55 | `/api/phone-otp/reset` | POST | Public; India only. Sets a new password after a valid account-scoped one-time code (hashed, 5-minute, 5 attempts, single use); bumps sessionVersion to sign out every session and clears email reset tokens; per-network and per-number rate limits; generic error for unknown numbers. |
| 56 | `/api/pilot/feedback` | GET, POST | Explicit staging/QA-runner guard; NextAuth session; approved UK student-pilot tester cohort only; suspended-account denial and per-account rate limit. |
| 57 | `/api/profile/[id]` | GET | NextAuth session; target profile lookup is same-market; suspended/deletion-requested viewer is denied and returned fields are allow-listed. |
| 58 | `/api/promotion/referrals/progress` | GET | NextAuth session; current account identity is taken from the session and referral progress is read for that account. |
| 59 | `/api/promotion/status` | GET | NextAuth session; current account identity is taken from the session. |
| 60 | `/api/qa/run` | GET, POST | Explicit QA-runner staging allowlist and constant-time shared-token checks for protected reports/queueing; target URL, market and account-count preflight; destructive cleanup requires durable terminal markers. |
| 61 | `/api/ratings` | POST | NextAuth session plus job-market guard; rater must be an authorized job party; stars/comment are bounded and unique job/rater constraint prevents duplicate rating. |
| 62 | `/api/security/csp-report` | POST | Public browser-report endpoint; rate-limited and handles reports as untrusted input. |
| 63 | `/api/signup` | POST | Public entry point; network rate limit, bounded/typed fields, supported market/currency validation and country-specific verification policy. |
| 64 | `/api/subscription/create-payment` | POST | NextAuth session; account access, suspension and market/plan eligibility checks before creating a pending provider-payment record. |
| 65 | `/api/subscription/webhook` | POST | Provider-neutral test hook, disabled (404) when DEPLOYMENT_ENVIRONMENT is production. Shared secret in request header with constant-time comparison; validates payment ID/body before applying an idempotent subscription transition. |
| 66 | `/api/subscription/webhook/stripe` | POST | Stripe-Signature HMAC over the raw body with a 5-minute tolerance (no session, no shared header secret); body size cap; live/test mode must match; applied once through the PaymentProviderEvent ledger with amount/currency/account binding. |
| 67 | `/api/vehicles` | GET, PATCH, POST | NextAuth session and account-scoped lookup; POST checks account type, suspension, market-specific registration/insurance inputs and bounded data; PATCH updates only the caller's own vehicle and returns it to admin review. |
| 68 | `/api/verification/start` | POST | NextAuth session; person-verification initiation is restricted to GB/GBP; India remains phone-only. |
| 69 | `/api/verification/start/webhook` | POST | Shared verification secret with constant-time comparison; validates attempt/status/provider reference and delegates to guarded lifecycle transition logic. |

## Test evidence map

| Evidence class | Current artefact | What it proves / limitation |
|---|---|---|
| Authenticated HTTP + isolated DB | `scripts/qa/lifecycle-api-e2e.mjs` | Creates separate real accounts and NextAuth sessions, starts a production Next server and checks object ownership, protected writes, lifecycle transitions and DB snapshots. The #38 remediation change extends it with GB↔IN reads, India phone-only job creation, forged market/currency rejection, same-market profile checks, India verification-flow rejection, existing-session suspension denial, notification ownership, rating party/idempotency and payment-market isolation. |
| Route/method matrix | `scripts/qa/lifecycle-auth-matrix.mjs` | 26 method/route denial cases; this is supplementary matrix evidence and must not be represented as exhaustive BOLA coverage of all 67 route files. |
| Account/suspension | `scripts/qa/account-api-security-contract.mjs`, `scripts/qa/suspension-access-contract.mjs` | Account API privacy/request validation and shared suspension-policy checks; source assertions and isolated helper execution are not substitutes for HTTP tests on every route. |
| Privacy | `scripts/qa/job-response-data-minimization-contract.mjs`, `scripts/qa/profile-vehicle-privacy-contract.mjs` | Contract coverage for the response surfaces named by each test; other response paths still require review. |
| Worker recovery/concurrency | `scripts/qa/worker-concurrency-contract.mjs` | Two worker processes compete for one queued row and test stale-heartbeat finalisation on isolated CI PostgreSQL; stale runs fail rather than being automatically re-queued. |
| Rendered accessibility | `scripts/qa/design-accessibility-contract.mjs` plus Validate workflow rendered scan | Static design contracts and the rendered public-route browser scan; does not constitute a screen-reader/user study or full authenticated workflow accessibility sign-off. |

## Audit rules

1. A route being listed here is not a pass. Each remaining high-risk route family must have an authenticated HTTP test or a documented, justified exception.
2. A denial test must assert both the HTTP status and that the relevant persisted state remains unchanged.
3. Client-supplied country, currency, account IDs, owner IDs and role flags are untrusted. Market and actor identity must be derived from the authenticated account and trusted server state.
4. Signed bridge/webhook endpoints require negative signature, stale timestamp/replay and malformed-payload tests. A shared-secret check in source is not itself replay protection.
5. Mark a control complete only with the exact test/CI name, commit SHA, result and evidence type (static inspection, deterministic contract, isolated HTTP/DB test, staging test or independent human review).
6. Email/SMS provider setup, real payment processing, Railway administration, database backup/restore and live pilot operations remain separately tracked in issue #102 and are not blockers for this app-code issue.

## Current audit boundary

This inventory is the route index for the 68 route files observed on the reviewed baseline. The full application security audit remains open until the remaining route families, worker recovery, broader PII/cache/log/header review and authenticated UX/accessibility checks have the evidence described above.
