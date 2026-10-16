# Controlled Live-Test Runbook

**Purpose:** operate a limited, monitored test of the freight marketplace after release gates pass. This is not approval for public launch or unrestricted real-world freight operations.

## Non-negotiable boundaries

- Use the staging environment and staging database only for test accounts, test jobs, test incidents and test evidence.
- Do not deploy to production as part of this runbook. A production release requires a separate explicit decision.
- Payment-provider integration and real email delivery/verification remain deferred. Do not collect real payment details, claim that a payment was processed, or depend on email delivery in this phase. Clearly explain any manual tester onboarding/verification.
- Preserve existing fleet pricing by vehicle count.
- Use synthetic/test freight scenarios unless the operator has separately approved real carriage, insurance, safety, legal and support arrangements.
- Do not upload genuine medical records, identity documents, customer personal data or confidential commercial documents into test incidents. Use synthetic, redacted evidence.
- Never run data cleanup against production. Verify the environment and the exact test-run identifier before any cleanup.

## Go/no-go gate before inviting external testers

All gates below must be evidenced, not inferred from a successful build.

1. **Code and release**
   - Pull request CI is green for the current head commit.
   - Review the full diff and migrations; confirm no unrelated pricing or commercial-rule changes.
   - Confirm staging is running the intended commit and all migrations completed.
   - Confirm production still runs its previously approved deployment.
2. **Authentication and account boundaries**
   - Test signup/manual tester onboarding, login/logout, session expiry, and account role/verification restrictions.
   - Prove unrelated accounts cannot read or mutate another account's jobs, bids, incidents, evidence, notifications or admin data.
   - Prove only the configured tester-admin allowlist can use admin pages and APIs.
3. **Critical marketplace flows**
   - Complete post → search → bid/fixed-price acceptance → pickup → delivery marking → delivery confirmation → completion.
   - Test driver withdrawal before pickup, poster cancellation before pickup, delivery rejection/redelivery, and retries.
   - Test incidents for breakdown, health/safety emergency, wrong/unsafe load, damage and dispute; upload/download evidence; add an update; record an admin decision; verify party notifications. Specifically verify that the admin termination outcome atomically cancels only accepted/in-transit jobs, invalidates active bids, preserves prior milestones and conflicts safely if the job changed; verify delivered/completed jobs cannot be terminated.
   - Verify an incident report alone does not silently change job status; incident termination is impossible after delivery/completion; delivered jobs use dispute handling.
4. **Concurrency and data integrity**
   - Run controlled races: two drivers accepting, bid placement vs acceptance, edit vs acceptance, pickup vs cancellation/termination, duplicate upload, and duplicate notification/read requests.
   - Confirm exactly one valid state transition wins; losing requests receive actionable conflict responses; no duplicate bid awards or audit loss.
5. **Evidence, privacy and recovery**
   - Test wrong file signature, unsupported MIME, empty/oversized file, 10-file cap, 25 MB aggregate cap, participant access, unrelated-account denial, admin access and no-store download headers.
   - Verify backup includes incident evidence blobs and perform a restore to a separate isolated database. Record restore time and checksums.
   - Define retention/deletion, account deletion, legal-hold and backup-expiry behaviour before using real personal or commercial evidence.
6. **Operational readiness**
   - Publish the tester support contact, incident escalation procedure, manual recovery/reassignment/goods-return process, and who is on call during the test window.
   - Confirm monitoring, logs, rollback steps and staging QA flags/tokens. Never print secrets in logs or reports.
   - Browser-test desktop and mobile screens, slow network, empty/error states and upload retry.
7. **Explicit approval**
   - The operator records the test window, participant cap, supported test scenarios, data cleanup boundary, escalation owner and rollback trigger.
   - If any critical gate is unknown or failed, do not invite testers yet.

## Minimum end-to-end test matrix

| Scenario | Expected result | Evidence to retain |
|---|---|---|
| Register/login and session expiry | Correct access; no cross-account leakage | Redacted test ID, response and timestamp |
| Post a job | One job and one JOB_POSTED audit event | Job ID and audit event ID |
| Bid/fixed-price acceptance | One winner; competing acceptance conflicts safely | Job/bid IDs and resulting status |
| Edit vs accept race | Either edit wins while open or acceptance wins; no accepted terms overwritten | Both request IDs and final state |
| Pickup vs cancellation race | One valid transition wins; pickup cannot be erased | Final status and activity history |
| Breakdown/health/wrong load | Incident report remains visible; emergency can be escalated | Incident ID, reason and synthetic evidence hash |
| Evidence upload/download | Valid formats succeed; invalid files and unauthorised access fail | File metadata/hash and status codes |
| Termination after pickup | Job terminates only through incident path and preserves pickup history | Incident and termination activity IDs |
| Delivery dispute | Delivered/completed history is preserved | Delivery and dispute event IDs |
| Admin decision | Allowlisted admin can record a decision; termination conditionally cancels only accepted/in-transit jobs, invalidates active bids and preserves milestones; delivered/completed jobs are rejected; ordinary account is denied; parties notified | Resolution ID, termination activity ID (when applicable), resulting job status and notification IDs |
| Duplicate/retry requests | No duplicated business side effects | Request IDs and database activity evidence |
| Recovery/restore | Restored isolated DB contains jobs, audit and evidence hashes | Restore log, row counts and hash comparison |

## Test operation

### Before each session
- Record the staging commit SHA, deployment ID, environment, schema and test-run identifier.
- Confirm no pending deployment or migration is applying.
- Confirm monitoring and the support owner are available.
- Use unique synthetic account/job identifiers. Do not reuse production data.

### During the session
- Capture request correlation ID, route, status code, latency, and synthetic entity IDs.
- Redact credentials, cookies, tokens, contact details and uploaded file contents from logs.
- Log every failure as: severity, expected behaviour, observed behaviour, reproduction steps, affected role, entity IDs, timestamp and evidence location.
- Do not retry a state-changing request blindly after a timeout; read current state first to avoid duplicate actions.

### Stop immediately if
- Cross-account data or private evidence is exposed.
- A completed/delivered job can be silently erased or a duplicate award occurs.
- A migration targets the wrong environment or a cleanup target is ambiguous.
- Evidence cannot be accessed by authorised parties or can be accessed by unrelated accounts.
- A critical route returns unexpected 5xx errors, data is corrupted, or restore/rollback safety is uncertain.

### After each session
- Reconcile jobs, bids, notifications, incidents and activity events against the scenario log.
- Clean up only records explicitly tagged to that staging test run and only after reviewing a read-only cleanup inventory.
- Preserve failure evidence until triage is complete; do not delete evidence needed for an open incident.
- Publish a concise pass/fail report with the denominator, critical failures, latency percentiles, outstanding severity-1/2 issues and the next go/no-go decision.

## Current status

This runbook defines the gate; it does not mark the gate as passed. CI success and unauthenticated endpoint smoke checks are necessary but insufficient. Until authenticated end-to-end, concurrency, evidence restore and operational recovery checks are recorded against the deployed staging commit, the platform is **not cleared for external live testers**.
