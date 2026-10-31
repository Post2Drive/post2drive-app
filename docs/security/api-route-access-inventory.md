# API route and method access inventory

**Scope:** `app/api/**/route.ts` on the Post2Drive app `main` baseline (57 route files).  
**Review type:** source-level route inventory. A listed guard is a control observed in the route or its shared helper; it is not a claim that every route has passed a full authenticated adversarial HTTP test. See the evidence matrix below.

## Route inventory

| # | Route | Exported methods | Observed authentication / ownership boundary |
|---:|---|---|---|
| 1 | `/api/account/access` | GET | NextAuth session; account identifier taken from session; reads current account access state. |
| 2 | `/api/account` | GET, PATCH, DELETE | NextAuth session; current account only; bounded/validated mutations, lifecycle concurrency and session-revocation controls; rate limiting where configured. |
| 3 | `/api/admin/company-verification` | GET, POST | NextAuth session plus tester-admin authorization; review is limited to GB/GBP submissions and creates an admin audit event. |
| 4 | `/api/admin/incidents/resolve` | GET, POST | NextAuth session plus tester-admin authorization; POST validates job/incident/outcome/notes, checks job state, and records the administrator decision. |
| 5 | `/api/admin/performance` | GET | Retired legacy endpoint; returns the replacement admin route rather than the former performance data. |
| 6 | `/api/admin/qa-campaigns/[id]` | DELETE | NextAuth session plus tester-admin authorization; deletes only the addressed campaign resource. |
| 7 | `/api/admin/qa-campaigns/[id]/start` | POST | NextAuth session plus tester-admin authorization and explicit staging-only QA-runner guard. |
| 8 | `/api/admin/qa-campaigns/access` | POST, DELETE | NextAuth session; same-origin enforcement, request rate limit and configured Ops Dashboard credentials for issuing/revoking the QA-admin cookie. |
| 9 | `/api/admin/qa-campaigns` | GET, POST | NextAuth session plus tester-admin authorization; validates draft input; GET is no-store; execution remains staging-guarded. |
| 10 | `/api/admin/research` | GET | Tester-admin authorization; unauthenticated callers receive 401 and non-admin sessions receive 403. |
| 11 | `/api/admin/testers` | GET, POST | Tester-admin authorization; code generation is additionally restricted to the explicit staging environment and writes admin audit records. |
| 12 | `/api/auth/[...nextauth]` | GET, POST | NextAuth handlers; credential/session policy is enforced by the shared NextAuth configuration. |
| 13 | `/api/auth/forgot-password` | POST | Public entry point; rate-limited and uses a generic response to avoid account enumeration. |
| 14 | `/api/auth/reset-password` | POST | Public token flow; rate-limited, validates/consumes a one-time reset token and revokes existing sessions. |
| 15 | `/api/company-verification` | POST | NextAuth session; GB/GBP-only market gate rejects India before accepting a company-verification submission. |
| 16 | `/api/email/verification/resend` | POST | Public entry point with rate limit and generic response; looks up an email address without confirming account existence. |
| 17 | `/api/email/verify` | POST | Public one-time token flow with rate limiting, expiry/consumption checks and conditional state update. |
| 18 | `/api/health` | GET | Public operational health endpoint; no account data. |
| 19 | `/api/internal/admin-bridge` | POST | Signed bridge request: HMAC-SHA256, timestamp freshness window, nonce format, constant-time signature comparison and persisted replay rejection; QA-sensitive actions remain environment-guarded. |
| 20 | `/api/jobs/[id]/accept` | POST | NextAuth session plus shared job-market guard; driver eligibility and job-state/ownership checks. |
| 21 | `/api/jobs/[id]/activity` | GET | NextAuth session plus shared job-market guard and job-party authorization. |
| 22 | `/api/jobs/[id]/bid` | POST | NextAuth session, job-market guard, request rate limit, driver/vehicle eligibility and open-job state checks. |
| 23 | `/api/jobs/[id]/bids/[bidId]/accept` | POST | NextAuth session plus job-market guard; job poster ownership and bid/job association are checked. |
| 24 | `/api/jobs/[id]/bids` | GET | NextAuth session plus job-market guard; bids are returned to authorized job parties. |
| 25 | `/api/jobs/[id]/cancel` | POST | NextAuth session plus job-market guard; poster ownership and allowed transition are checked. |
| 26 | `/api/jobs/[id]/confirm-delivered` | POST | NextAuth session plus job-market guard; poster/party and delivery-state checks. |
| 27 | `/api/jobs/[id]/confirm-pickup` | POST | NextAuth session plus job-market guard; assigned-driver and lifecycle-state checks. |
| 28 | `/api/jobs/[id]/driver-cancel` | POST | NextAuth session plus job-market guard; assigned-driver and allowed withdrawal-state checks. |
| 29 | `/api/jobs/[id]/edit` | PATCH | NextAuth session plus job-market guard; poster ownership, open-state conditional write and market-derived currency/time-zone validation. |
| 30 | `/api/jobs/[id]/incidents/[incidentId]/evidence/[evidenceId]` | GET | NextAuth session plus job-market guard; evidence is selected through job/incident/evidence identity and restricted to a job party or explicit tester-admin exception; private no-store/nosniff response. |
| 31 | `/api/jobs/[id]/incidents/[incidentId]/evidence` | POST | NextAuth session plus job-market guard; job-party check, rate limiting, bounded upload, MIME/signature/filename checks and per-incident limits. |
| 32 | `/api/jobs/[id]/incidents` | GET, POST | NextAuth session plus job-market guard; job-party ownership; incident creation is tied to the addressed job. |
| 33 | `/api/jobs/[id]/incidents/terminate` | POST | NextAuth session plus job-market guard; incident/job association, party authority and allowed outcome/state transition. |
| 34 | `/api/jobs/[id]/incidents/updates` | POST | NextAuth session plus job-market guard; incident/job association and party authorization. |
| 35 | `/api/jobs/[id]/mark-delivered` | POST | NextAuth session plus job-market guard; assigned-driver and lifecycle-state checks. |
| 36 | `/api/jobs/[id]/payment/confirm-received` | POST | NextAuth session plus job-market guard; assigned-driver and payment-state checks; this is an in-app confirmation, not a provider settlement. |
| 37 | `/api/jobs/[id]/payment/mark-paid` | POST | NextAuth session plus job-market guard; poster and lifecycle-state checks; this is a user marker, not a provider charge. |
| 38 | `/api/jobs/[id]/reject-delivered` | POST | NextAuth session plus job-market guard; poster/party and lifecycle transition checks. |
| 39 | `/api/jobs/[id]` | GET | NextAuth session plus job-market guard; only the poster or accepted driver may read the private job detail. |
| 40 | `/api/jobs/[id]/unassign` | POST | NextAuth session plus job-market guard; poster ownership and pre-pickup state checks. |
| 41 | `/api/jobs` | GET, POST | NextAuth session; market is derived from the account record, not client country/currency; POST uses bounded JSON, schema/business validation, rate limit and access checks. |
| 42 | `/api/notifications/[id]/read` | POST | NextAuth session; update predicate includes both notification ID and the signed-in account ID; foreign record returns not-found. |
| 43 | `/api/notifications` | GET | NextAuth session; query and unread count are scoped to the signed-in account ID with selected response fields. |
| 44 | `/api/payments` | GET | NextAuth session; account/market-scoped completed jobs and response allowlist; private no-store response. No live payment-provider settlement is implied. |
| 45 | `/api/pilot/feedback` | GET, POST | Explicit staging/QA-runner guard; NextAuth session; approved UK student-pilot tester cohort only; suspended-account denial and per-account rate limit. |
| 46 | `/api/profile/[id]` | GET | NextAuth session; target profile lookup is same-market; suspended/deletion-requested viewer is denied and returned fields are allow-listed. |
| 47 | `/api/promotion/referrals/progress` | GET | NextAuth session; current account identity is taken from the session and referral progress is read for that account. |
| 48 | `/api/promotion/status` | GET | NextAuth session; current account identity is taken from the session. |
| 49 | `/api/qa/run` | GET, POST | Explicit QA-runner staging allowlist and constant-time shared-token checks for protected reports/queueing; target URL, market and account-count preflight; destructive cleanup requires durable terminal markers. |
| 50 | `/api/ratings` | POST | NextAuth session plus job-market guard; rater must be an authorized job party; stars/comment are bounded and unique job/rater constraint prevents duplicate rating. |
| 51 | `/api/security/csp-report` | POST | Public browser-report endpoint; rate-limited and handles reports as untrusted input. |
| 52 | `/api/signup` | POST | Public entry point; network rate limit, bounded/typed fields, supported market/currency validation and country-specific verification policy. |
| 53 | `/api/subscription/create-payment` | POST | NextAuth session; account access, suspension and market/plan eligibility checks before creating a pending provider-payment record. |
| 54 | `/api/subscription/webhook` | POST | Shared secret in request header with constant-time comparison; validates payment ID/body before applying an idempotent subscription transition. |
| 55 | `/api/vehicles` | GET, POST | NextAuth session and account-scoped lookup; POST checks account type, suspension, market-specific registration/insurance inputs and bounded data. |
| 56 | `/api/verification/start` | POST | NextAuth session; person-verification initiation is restricted to GB/GBP; India remains phone-only. |
| 57 | `/api/verification/start/webhook` | POST | Shared verification secret with constant-time comparison; validates attempt/status/provider reference and delegates to guarded lifecycle transition logic. |

## Test evidence map

| Evidence class | Current artefact | What it proves / limitation |
|---|---|---|
| Authenticated HTTP + isolated DB | `scripts/qa/lifecycle-api-e2e.mjs` | Creates separate real accounts and NextAuth sessions, starts a production Next server and checks object ownership, protected writes, lifecycle transitions and DB snapshots. The #38 remediation change extends it with GB↔IN reads, India phone-only job creation, forged market/currency rejection, same-market profile checks, India verification-flow rejection, existing-session suspension denial, notification ownership, rating party/idempotency and payment-market isolation. |
| Route/method matrix | `scripts/qa/lifecycle-auth-matrix.mjs` | 26 method/route denial cases; this is supplementary matrix evidence and must not be represented as exhaustive BOLA coverage of all 57 route files. |
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

This inventory is the route index for the 57 route files observed on the reviewed baseline. The full application security audit remains open until the remaining route families, worker recovery, broader PII/cache/log/header review and authenticated UX/accessibility checks have the evidence described above.
