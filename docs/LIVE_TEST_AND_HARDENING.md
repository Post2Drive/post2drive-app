# Live-Test and Launch Hardening Plan

**Status:** implementation branch in progress; not a launch approval  
**Scope:** job lifecycle, security, marketplace operations, reliability/data/recovery  
**Deferred by product decision:** live payment-provider integration and real email delivery/verification tests until after the live-testing stage  
**Commercial rule:** retain existing fleet pricing by vehicle count; do not change the current tier trigger or prices.

## Operating principle: flexible where possible, strict where necessary

The platform should not confuse business policy with safety/security invariants.

- **Hard stops:** authentication/authorization, ownership, unsafe or invalid state transitions, duplicate financial actions, race conditions, and actions that would destroy audit history.
- **Recoverable exceptions:** breakdowns, health emergencies, wrong/unsafe loads, delays, failed contact, delivery damage, and payment disputes should open a documented incident workflow rather than trapping users behind a generic conflict response.
- **No silent erasure:** keep the original job state and append incident/update/resolution history. Never rewrite an in-transit or delivered job as if pickup/delivery never happened.
- **Proportionate evidence:** request the evidence reasonably available for the event. Do not require sensitive medical records for a health emergency; allow evidence to be added later when immediate safety comes first.
- **Human review and appeal:** policy thresholds should flag patterns for review, not automatically label every unusual but documented exception as abuse.
- **Explain the next step:** conflict responses should explain what the user can do next, including reporting an incident or contacting support.
- **Evidence integrity and privacy:** incident evidence supports private database-backed uploads of JPEG, PNG, WebP and PDF files (5 MB each; 10 files/25 MB per incident), MIME/signature validation, SHA-256 hashes, and participant/admin-authorised downloads. HTTPS references remain optional. Retention/deletion rules, backup/restore proof and operational storage monitoring still require validation before launch.

## Work completed in this branch

- [x] Restrict ordinary poster cancellation to pre-pickup states (open or accepted). It cannot erase in-transit, delivered, or completed history.
- [x] Add a separate incident-based termination endpoint for genuine breakdown, health/safety, wrong-load and related exceptions while accepted/in transit. It records reason/notes/evidence references, atomically terminates the active job, invalidates bids, notifies the other party, and preserves pickup/delivery milestones in the activity history. It does not apply ordinary cancellation-frequency blocking; the event remains auditable for later abuse review.
- [x] Add participant-only incident reporting/history at POST/GET /api/jobs/[id]/incidents and append-only follow-up updates at POST /api/jobs/[id]/incidents/updates. Supported reasons include breakdown, health emergency, wrong/unsafe load, accident, delay, pickup problem, delivery damage, contact issue, payment dispute and other.
- [x] Incident reports append a JobActivity event with reason, description, reporter role, time, status-at-report, requested outcome, location and evidence references. Reporting does not silently change the job status.
- [x] Make initial job creation and the JOB_POSTED activity record a single transaction.
- [x] Make open-job edits conditional on the job still being open and owned by the poster at write time. This prevents an edit that races with acceptance from changing the accepted job.
- [x] Record job edits in JobActivity, including whether material changes invalidated active bids.
- [x] Restrict private poster/driver contact details to the current poster and accepted driver. A former driver who backed out may still see allowed job history but does not receive the current parties' contact details.
- [x] Require pickup confirmation before marking a job delivered; delivery marking now requires in_transit.

These are code changes awaiting CI and staging regression validation. They are not yet considered proven until targeted tests and staging checks pass.

## Lifecycle policy: cancellation, incidents, and resolution

### Ordinary cancellation
- Before pickup, allow ordinary cancellation according to actor permissions and the existing cancellation limits.
- After pickup, ordinary cancellation must not reverse the job state or delete pickup evidence. For a genuine incident that makes continuation impossible, an involved party can use the separate incident-based termination action, which sets the current active job status to cancelled while preserving prior pickup milestones and an immutable reason/evidence trail.
- Once delivery has been marked or confirmed, do not use termination to erase delivery. Open a delivery/damage/payment dispute instead.
- A post-pickup breakdown, health emergency, wrong load, unsafe load, accident, delivery damage or dispute must be recorded as an incident.
- The driver must be able to report an incident and stop safely without first obtaining the other party's approval.
- Do not treat a documented emergency as automatic misconduct. Repeated patterns can be reviewed with context and evidence.

### Incident workflow (remaining work)
- [x] Participants can create and read append-only incident report events, add later updates, and access the incident page from involved job cards.
- [x] Add access-controlled database-backed file uploads with file type/signature checks, per-file and per-incident size caps, SHA-256 integrity hashes, participant/admin access control and private no-store downloads. [ ] Validate backup/restore for evidence blobs and define retention/deletion rules before live testing.
- [x] Add participant-only incident updates/evidence references as new immutable events at POST /api/jobs/[id]/incidents/updates, not overwrites.
- [x] Add an allowlisted admin incident review page and append-only resolution-decision records with notifications to the parties.
- [x] Execute the admin `terminate_with_incident` outcome atomically for accepted/in-transit jobs only: set cancelled state, invalidate active bids, preserve prior pickup/delivery milestones, write termination and resolution audit events, notify both parties, and return a conflict if the job changed concurrently. Delivered/completed jobs cannot be terminated through this path.
- [ ] Remaining outcomes (resume, replacement driver/vehicle, return goods, reassignment, delivery/damage dispute and payment dispute) are recorded decisions only; support must coordinate and document operational actions manually until their dedicated workflows exist.
- [ ] Add acknowledgement and response timelines, escalation when the other party is unreachable, and a way to contest a resolution.
- [ ] Define evidence retention/deletion and privacy rules; limit access to involved parties and authorised staff, and test account deletion, legal holds and backup expiry behaviour.
- [ ] Decide which incident types should temporarily pause ordinary progress, and provide a safe, audited way to resume. Do not use a blanket hold that traps users in emergencies.
- [ ] Add fair cancellation/account-health policy: separate genuine emergencies from unexplained repeated cancellations; provide human review for disputed penalties.

## Selection 2 — job lifecycle and account security

### Required regression scenarios
- [ ] Poster creates a job: one job and one JOB_POSTED activity row are committed together.
- [ ] Poster edits an open job: edit succeeds and an audit event is recorded.
- [ ] Race edit vs. accept: at most one wins; if acceptance wins, the edit returns a conflict and accepted terms remain unchanged.
- [ ] Material edits invalidate active bids; non-material edits follow the documented bid policy.
- [ ] Two drivers accept concurrently: exactly one succeeds; all other attempts return a conflict.
- [ ] Pickup confirmation is accepted only for an accepted job and transitions to in_transit exactly once.
- [ ] Mark-delivered is rejected while merely accepted; succeeds only after pickup/in-transit.
- [ ] Delivery confirmation/rejection/redelivery follows the existing workflow and cannot complete a job twice.
- [ ] Cancellation succeeds only before pickup, invalidates active bids, expires opportunities, and records the audit event atomically.
- [ ] Incident report works for the poster and accepted driver across relevant post-acceptance states, and rejects unrelated accounts.
- [ ] Incident reporting alone never changes the underlying job status; incident-based termination changes an active job only with an existing report, a reason, notes and a conditional status transition. Test races and ensure delivered/completed jobs cannot be terminated.
- [ ] Invalid reason, malformed JSON, oversized text, excessive/invalid evidence references and unauthorised requests are rejected safely.
- [ ] Repeated or stale lifecycle requests do not create duplicate side effects.
- [ ] Cross-account attempts to read/edit/cancel/accept/confirm jobs return the expected 403/404 and do not mutate data.
- [ ] Current parties can see the required contact information; unrelated and former drivers cannot.
- [ ] Admin routes require the configured email allowlist and do not expose operational data to ordinary accounts.

## Rigidity and exception audit — remaining review

For every rejection, classify it as **security invariant**, **data-integrity invariant**, **commercial rule**, or **recoverable exception**. Keep the first two strict; document the commercial rule; provide an incident/support route for the last category.

- [ ] Review all hard-coded rate limits and cooldowns. Confirm they are abuse controls with sensible windows, clear errors and a review path—not silent permanent punishment.
- [ ] Review vehicle/account verification restrictions: distinguish legally required eligibility from missing information that can be corrected or manually reviewed.
- [ ] Review subscription/trial/qualification thresholds for transparent explanations, boundary tests, fair opportunity accounting and appeal paths. Do not change existing fleet pricing by vehicle count.
- [ ] Review bid expiry, job availability, edit restrictions and duplicate prevention. Preserve race safety while allowing recoverable retries and clear next steps.
- [ ] Review status transitions for a safe exception path at every stage, including driver withdrawal before pickup, poster cancellation, failed pickup, incident during transit, failed delivery, and disputes after delivery.
- [ ] Review all user-facing 400/401/403/404/409/410/422/429/5xx responses for actionable guidance and no sensitive leakage.
- [ ] Review admin actions for least privilege, reason capture, immutable audit trail and reversibility where safe.
- [ ] Review all destructive operations for idempotency, optimistic concurrency, audit retention and safe retry behaviour.
- [ ] Review all forms for accessibility, mobile usability, save/retry affordances, and a way to recover from temporary network failure.

## Selection 3 — marketplace and operational readiness

### Existing functionality to verify
- [ ] Search by route/text, vehicle type, and price range; invalid price bounds return 400.
- [ ] Search/sort/pagination remain stable under a growing job dataset. Add pagination only with a backwards-compatible response contract.
- [ ] Bid submission, bid invalidation, award and stale-bid cleanup behave consistently under concurrent requests.
- [ ] Ratings enforce participant eligibility, one rating per rater/job, 1–5 stars, and safe comment length; duplicate racing submissions return a deterministic conflict.
- [ ] Admin performance data separates QA traffic where attribution exists and does not misclassify untagged historical metrics.
- [ ] Verify the admin dashboard covers account types, verification/subscription states, job funnel, bids, incidents/cancellations, vehicle compliance, ratings, payment status, failures, response times and bottlenecks.
- [x] Add a Notification model, account-scoped feed/read API and dashboard notification center; notify parties on acceptance, pre-pickup cancellation, pickup confirmation, delivery marking/completion, incident reports/updates and support decisions. [ ] Verify all remaining lifecycle events (bids, driver withdrawal/unassignment, delivery rejection, verification/access changes) and test deduplication/ownership under concurrency.
- [ ] Publish/review Terms, Privacy Notice, support contact, cancellation/refund policy, retention/deletion process, and incident escalation procedure.
- [ ] Verify trust/dispute workflows, evidence retention, moderation, and account suspension rules.
- [ ] Run responsive browser tests on desktop and common mobile viewport sizes, including slow network and empty/error states.

## Selection 4 — reliability, data, and recovery

- [ ] Confirm production and staging use the intended schema and application configuration. Current schema isolation is logical within the same PostgreSQL cluster, not physical database isolation.
- [ ] Confirm temporary QA flags/tokens are disabled or absent on production and staging cleanup remains staging-only.
- [ ] Configure and document independent PostgreSQL backups; verify a restore into a safe isolated environment. No destructive production cleanup before restore evidence exists.
- [ ] Validate Prisma migrations against a production-like copy; use additive/backward-compatible changes where practical.
- [ ] Add/verify alerts for 5xx rate, latency, database saturation, failed lifecycle operations, and provider failures.
- [ ] Run realistic concurrent acceptance/edit/pickup/delivery/cancellation/incident tests, then load, soak, dependency-failure and restart/recovery tests.
- [ ] Report p50/p95/p99 latency, eligible logical operations, logical failures, retries, and results per critical workflow.
- [ ] Document rollback, incident ownership, and release/restore procedures.
- [ ] Keep the one-failure-per-million objective labelled as a target until statistically representative evidence supports it.

## Deferred until after live testing

- [ ] Select and configure a payment provider.
- [ ] Implement provider signature verification, idempotency, replay handling, refunds, reconciliation and the full payment lifecycle.
- [ ] Configure verified email delivery and test verification/reset token lifecycle in real inboxes.
- [ ] Enable payment/email enforcement only after provider-specific sandbox and production readiness gates pass.

## Controlled live-test entry gate

The detailed tester go/no-go criteria, critical workflow matrix, stop conditions, evidence requirements and session procedures are maintained in `docs/CONTROLLED_LIVE_TEST_RUNBOOK.md`. Treat that runbook as a required release artifact; its gates must be evidenced, not merely checked off because CI is green.

## Release rule

Do not merge or deploy based on this checklist alone. Require green CI, targeted staging regression tests, a reviewed diff, and explicit confirmation before any production deployment. A successful synthetic 500-account run is useful evidence but is not a substitute for browser-based live testing, backup/restore proof, or real provider integration tests.
