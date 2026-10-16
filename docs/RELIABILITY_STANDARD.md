# Post2Drive Reliability Standard

Status: **target defined; not yet demonstrated**  
Applies to: application operations, APIs, background work, billing, identity, and job lifecycle  
Change policy: implement and validate in isolated branches/staging first; do not deploy to production as part of reliability-target definition.

## 1. Reliability objective

Post2Drive adopts a Six Sigma-inspired, defect-prevention-first standard:

- **Primary overall target (user-specified):** no more than 1 failed logical operation per 1,000,000 eligible operations (1 DPMO if one opportunity is defined per operation; 99.9999% success).
- **Previous comparison threshold:** 1 failed logical operation per 100,000 eligible operations (10 DPMO; 99.999% success). The stricter one-per-million target is now the primary acceptance threshold.
- **Critical invariants:** zero tolerated confirmed defects involving unauthorized access, cross-account data exposure, duplicate job allocation, incorrect charges/refunds, corrupted records, or invalid job-state transitions.
- The one-per-million objective is not an allowance to knowingly accept a defect. Every confirmed defect must be triaged, contained, root-caused, and corrected according to severity.

This is not a claim that the platform currently meets Six Sigma quality. The conventional Six Sigma benchmark of 3.4 DPMO uses the conventional 1.5-sigma shift assumption. Post2Drive's one-per-million objective is the primary operational target and is stricter than the conventional 3.4 DPMO benchmark.

## 2. Define the denominator before measuring

An operation is one externally meaningful attempt to perform a defined action, such as sign-up, job creation/editing, bid submission/withdrawal, job award, pickup, delivery, dispute/redelivery, account change, or a billable event.

- Count each user/business attempt once in the primary operation denominator and retain a separate request-attempt denominator for infrastructure diagnostics.
- Count a failed logical operation as a failure even if a retry later succeeds. Record retry recovery separately; do not hide the original failure.
- Timeouts, unexpected 5xx responses, incorrect outcomes, duplicate effects, and operations that violate a business invariant count as failures.
- Expected validation rejections (for example, invalid input or a forbidden action) are not reliability failures when the API returns the documented response and creates no side effects.
- Segment results by workflow, release, account cohort, dependency, and severity. A good aggregate must not mask a failing critical workflow.
- Define and version the eligible-operation catalogue before each measurement window; exclude health probes and test-harness polling from business-operation denominators.

## 3. Non-negotiable invariants

The following require zero observed defects and immediate release/rollout stop on confirmation:

1. Authorization boundaries prevent one account from reading or changing another account's private records.
2. A job cannot be awarded to multiple drivers or transition through an invalid lifecycle state, including under concurrent requests and retries.
3. Repeated delivery of the same logical request cannot create duplicate financial or business side effects where idempotency is required.
4. Billing, subscription entitlements, usage caps, refunds and payment webhook handling reconcile to a traceable ledger; never infer successful settlement from a browser redirect.
5. Database constraints and transactions preserve referential integrity and prevent partial lifecycle updates.
6. Audit records and security events are retained without leaking credentials, tokens, or sensitive payloads.

## 4. Measurement and statistical evidence

For zero failures in n independent, representative trials, the exact one-sided 95% upper confidence bound for the underlying failure probability is:

`1 - 0.05^(1/n)`

For the primary one-per-million target, 2,995,731 independent, representative, failure-free operations are required for the exact one-sided 95% upper confidence bound to fall at or below one failure per million. For comparison, 299,572 such operations establish one failure per 100,000 at the same confidence level. Repeated requests from the same accounts or the same narrow workflow may be correlated, so raw volume alone is not sufficient evidence.

The documented 5,299/5,299 passing staging checks are a useful scenario-test result, not statistical proof of the primary target. At a one-sided 95% confidence level, zero failures in 5,299 independent representative trials gives an upper bound of about 566 failures per million. Do not extrapolate this result to the target.

## 5. DMAIC execution plan

### Define
- Maintain a versioned operation catalogue, severity taxonomy, expected outcomes, and release acceptance gates.
- Separate functional correctness, reliability, security, performance, recoverability, and third-party integration readiness.

### Measure
- Instrument logical operations with correlation IDs, outcome, latency, retry count, dependency status, and release identifier.
- Keep QA traffic tagged and excluded from operational business metrics, while retaining QA audit records.
- Report total eligible operations, failures, failure rate, confidence bound, p50/p95/p99 latency, and per-workflow results.

### Analyze
- Group failures by root cause, not just HTTP status.
- Distinguish product defects, environment/dependency failures, test-harness defects, expected validation rejections, and ambiguous outcomes.
- Investigate every critical-invariant breach and repeated failure mode.

### Improve
- Prioritize prevention: unique constraints, transactions, idempotency, authorization checks, validated state machines, bounded retries, timeouts, and safe compensation.
- Test concurrency races, duplicate delivery, dependency outages, partial failure, restart/recovery, and rollback.
- Add regression tests for each confirmed defect.

### Control
- Require CI gates and staging evidence before production rollout.
- Use gradual rollout, monitoring, rollback criteria, and a documented incident owner.
- Re-measure after material code, schema, infrastructure, or provider changes.
- Never declare target attainment from a single synthetic run or from a confidence calculation alone.

## 6. Release gates

A release must not be labelled production-ready solely because the 500-account simulation passes. Before launch, require:

- Green schema/migration, type-check, build, unit/integration and critical-flow tests.
- Browser-based end-to-end journeys for poster, driver, mixed-role and admin permissions.
- Concurrency and idempotency tests for job award, delivery confirmation, billing events and webhook replay.
- Load, soak, dependency-failure and recovery tests with reproducible reports.
- Verified independent production backup and a successful restore rehearsal before any production cleanup or destructive migration.
- Provider sandbox evidence for email, payment settlement/webhooks, and external verification where applicable.
- Reviewed runbook, alert thresholds, rollback procedure, data-retention plan and incident-response ownership.
- Zero unresolved critical defects; other known defects explicitly risk-accepted by the release owner.

## 7. Current evidence and blockers

As of the latest documented QA run:
- Staging API simulation: 500 accounts, 5,299 checks passed, 0 failed; p50 39 ms, p95 502 ms.
- This was an API-driven simulation, not browser usability testing.
- Real email delivery, payment settlement and external provider callbacks were not tested.
- Production synthetic-data cleanup remains blocked pending independently verified backup/restore evidence and a reviewed distinct-ID deletion manifest.
- The primary one-per-million target is **not yet demonstrated**.

See [QA Stage Report](QA_STAGE_REPORT.md) and [Stage 1 Isolation Notes](QA_STAGE1_ISOLATION.md).
