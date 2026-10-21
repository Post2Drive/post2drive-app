# Post2Drive Security, Reliability and UX Audit

**Status:** In progress; not a security certification or production launch approval.
**Working branch:** `audit/security-ux-hardening-2026-10`
**Scope:** application/API, account lifecycle, GitHub controls, Railway operations, market compliance, accessibility, performance and design quality.

## Guardrails
- Do not merge or deploy as part of this audit. Railway staging currently follows `feature/country-localisation-audit`; changes to that branch can affect staging.
- Do not run broad QA campaigns, mutate existing QA records, delete historical failures, rotate credentials, or delete/repoint Railway services/volumes without a separate explicit operation plan.
- Destructive tests must use isolated, disposable accounts and data, never real users.
- Report evidence as one of: static review, CI, isolated integration test, live staging check, or independent human review. Unknown means unverified, not passed.
- Keep independent review and merge/release gates separate from implementation.

## P0 — Security and account lifecycle
- [ ] Inventory every API route/method and classify public, authenticated, account-owner, job-party, admin and QA-only access.
- [ ] Test signup, verification, login, refresh, password change, logout, deletion request, old-session rejection and re-login rejection end-to-end.
- [ ] Verify deletion/anonymisation, linked personal data, documents/evidence, audit/legal retention and backup expiry.
- [ ] Test old sessions against every protected route, including parallel requests and job/evidence endpoints.
- [ ] Test IDOR/BOLA for jobs, bids, vehicles, account settings, incidents, evidence, notifications, ratings, payment records and admin/QA endpoints with two isolated accounts.
- [ ] Test cross-market access and client-side country/currency tampering.
- [ ] Audit admin/QA authentication, allowlists, CSRF, cookie settings, session expiry, environment guards and secrets.
- [ ] Review login/signup/reset/verification rate limits, token entropy, expiry, single-use, resend invalidation and account enumeration.
- [ ] Review upload/download content, storage, URL handling, path traversal, size/type limits and private cache headers.
- [ ] Run dependency and static security analysis; reproduce, triage and remediate high/critical findings.
- [ ] Ensure logs/errors never expose secrets, tokens, raw request bodies, PII or database invocation details.

## P0 — API and workflow integrity
- [ ] Build a route/method contract matrix with auth role, market, validation, expected status and mutation behavior.
- [ ] Exercise create/edit/search/accept/bid/cancel/unassign/pickup/delivery/reject/incident/evidence/rating/notification workflows.
- [ ] Test duplicate requests, retries, stale state, race conditions, idempotency, transaction boundaries and unique audit events.
- [ ] Verify denied requests do not mutate data and return safe status codes.
- [ ] Test malformed/oversized JSON, input bounds, invalid enums, monetary precision, dates/time zones and database outage handling.
- [ ] Ensure UI/API never represents a provider-neutral payment status as actual charge, refund, payout or settlement.

## P1 — Railway and operations
- [ ] Verify service source commit, branch, environment, domain, health check, deploy triggers, variable names and least-privilege setup.
- [ ] Establish ownership and consumers of both PostgreSQL services. Verify the dashboard connection target and effective read-only privileges without printing secret values.
- [ ] Verify network exposure, TLS, private service access, backup ownership and restore path.
- [ ] Recompute current route-level 5xx and latency; separate expected disabled-webhook failures from real errors and investigate unattributed failures.
- [ ] Run a controlled backup restore drill; define RPO/RTO, rollback, alerts, incident response, connection limits and worker recovery.
- [ ] Profile representative load; idle CPU/memory is not evidence of capacity.
- [ ] Verify branch protections, required checks, secret scanning, dependency updates and release provenance.

## P1 — Market, legal and data protection
- [ ] Confirm India fixed-quote-only rules and no bidding/cross-border bypass.
- [ ] Verify every intended launch market's currency, vehicle types, registration, insurance/inspection, terminology and local date/time handling.
- [ ] Complete Terms, Privacy, retention/deletion, support, cookie/analytics, email verification and jurisdiction-specific legal review.
- [ ] Document data-subject requests, retention schedule, processors/subprocessors, access controls and breach response.

## P1 — UX and accessibility
- [ ] Test clean-user journeys from signup through deletion on desktop and narrow mobile.
- [ ] Audit loading, empty, error, retry, success, offline and double-submit states.
- [ ] Test keyboard-only, screen reader, focus order/visibility, contrast, reduced motion and touch target size.
- [ ] Apply Apple HIG-inspired principles: clarity, hierarchy, consistency, direct feedback, accessible controls and progressive disclosure.
- [ ] Remove duplicated/conflicting copy, dead controls and inconsistent forms without silently changing business rules.
- [ ] Verify visible copy, emails, notifications and legal screens in every supported market.

## P2 — Performance and maintainability
- [ ] Profile slow routes/queries before adding indexes; inspect N+1 queries, pagination, payload size, cache policy and DB connection usage.
- [ ] Review bundle size, images, unnecessary client work, component duplication and type safety.
- [ ] Add shared validation/auth helpers only where behavior remains equivalent.
- [ ] Keep deterministic isolated tests; preserve existing QA evidence.

## Security controls added in this branch
- A Content-Security-Policy-Report-Only header has been added to gather compatibility evidence before enforcing a stricter policy. This is monitoring, not an enforced CSP; the source allowlists must be tightened after observed reports.
- A CodeQL workflow has been added for JavaScript/TypeScript using security-extended queries on pushes, pull requests, weekly schedule and manual dispatch.
- These controls require CI execution and configuration review before they can be counted as passing.

## Evidence-based scorecard
Score each area 0–10 with evidence, unknowns, risk, owner, remediation and retest. Do not assign 9/10 based on intentions or code presence alone.

## Separate release gates
- [ ] Independent review of the exact final commit.
- [ ] Required CI green on that exact commit.
- [ ] Approved live staging E2E and recovery evidence.
- [ ] Legal/compliance gates resolved for intended markets.
- [ ] Explicit owner authorization for merge/deployment.
