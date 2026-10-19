# Post2Drive launch-gate inventory — 20 October 2026

This is an evidence inventory, not a launch approval. Railway staging is connected to
`feature/country-localisation-audit`; do not merge this audit branch or run staging QA,
migrations, or deployments without explicit approval.

## Classification

- **Evidenced complete** — supporting evidence is available for the specific gate.
- **Open** — work or proof is still required.
- **Blocked** — cannot be completed until an external decision, credential, service, or review exists.
- **Not tested** — no adequate test evidence has been collected.

## Ops Dashboard and database boundary

| Gate | Status | Evidence / remaining action |
| --- | --- | --- |
| Current staging release starts | Evidenced complete | Railway deployment `f2755518-bfd5-4b18-9803-1e6fbbd5c800` succeeded at commit `566284c6ebdfd44e5d5af9d416258c21c84010a9`; health check passed. |
| Dedicated read-only database connection | Evidenced complete | Startup log confirms `post2drive_qa` as `post2drive_ops_readonly`; the server checks role attributes, public-table readability, write privileges, sequence privileges, role memberships, schema CREATE privilege, and staging database identity before listening. |
| Explicit runtime privilege counts | Open | The successful deployment log does not print the counts for writable tables, sequence privileges, role memberships, or schema CREATE. The audit branch adds those safe non-secret counts to the startup message; collect them on the next approved deployment. |
| Historical role provisioning | Evidenced complete | 19 October pre-deploy log recorded 31 readable tables and 0 writable tables, with login enabled and superuser/create-role/create-database/RLS-bypass privileges disabled. That older log did not report role-membership count. |
| False “no active QA issues” state on query failure | Open — fix proposed | Dashboard queries currently return an empty array on a read error while also adding a warning. The audit branch makes the active-issue panel explicitly say the status is unavailable instead of displaying a healthy empty state. Validate and secret-scan checks passed on PR head `057716f0659c94e7ea259a451f89f1459e999ef2`; merge and deployment remain unapproved. |
| Retired `/api/admin/performance` endpoint | Evidenced complete; keep tombstone | Route is a database-free HTTP 410 tombstone. PR #35 removes the orphaned in-app component that still called the retired path and adds a tracked-source consumer audit; its latest CI is pending. Do not remove the tombstone until external-consumer checks are evidenced. |
| Replacement dashboard authorization | Isolated HTTP E2E proposed; CI pending | PR #35 adds an isolated Ops Dashboard HTTP test for anonymous/tampered sessions, invalid/valid login, protected metrics/QA reads, cross-origin action denial, fail-closed bridge behavior, and logout. It uses the ephemeral CI database and a read-only role. It also adds a built-Next.js HTTP E2E suite with signed NextAuth sessions for lifecycle APIs; the latest Validate run is queued/in progress. Deployed staging authorization remains not tested. |
| Legacy API consumers | Repository-local inventory proposed; external checks open | PR #35 adds a CI scan of tracked runtime source and removes the orphaned component caller. A read-only Railway HTTP-log sample found 0 old-path requests in 34 entries from 2026-10-19 19:40 UTC to 2026-10-20 21:06 UTC; a broader sample found 10 pre-deployment 401/403 hits on 2026-10-18 matching the old QA route-matrix probes. External bookmarks, monitoring, scheduled jobs, and third-party clients remain unverified; retain the 410 tombstone. |

## User-side security and PR #35

| Gate | Status | Evidence / remaining action |
| --- | --- | --- |
| CI on PR #35 latest head `f3db57d389a2e1b90c6d74178309c8d9c4800af7` | Pending | New lifecycle authorization matrix, legacy API scan, Ops Dashboard HTTP auth E2E, and built-app lifecycle HTTP E2E have been added to CI. Validate is running and Security Scan is queued on this latest head; the lifecycle HTTP suite now uses real NextAuth credentials/CSRF sign-in rather than synthetic cookies. Older green runs do not validate these latest additions. |
| Existing JWT after account deletion request | Isolated callback fixture passed; live session E2E open | CI fixtures exercise an already-issued token after deletion is requested or the account disappears. A deployed/provider-backed session test remains not tested. |
| Vehicle GET/POST after deletion request | Isolated route fixture passed; live session E2E open | CI executes both handlers with a pre-existing session and verifies 401 before reads/writes. Deployed verification remains not tested. |
| Cross-account authorization | Partial isolated coverage; matrix CI pending | Existing fixtures deny outsider job/evidence reads. PR #35 adds a route/method matrix and a built-Next.js HTTP suite using signed sessions for job lifecycle, incident, evidence, payment, bidding, activity, and vehicle/account-deletion behavior. Vehicle collection remains account-scoped/self-service; every object-specific document/vehicle route must be accounted for if one is added. The latest CI run must pass; deployed E2E remains not tested. |
| Concurrent lifecycle transitions | Partial isolated coverage; full route transaction test open | Isolated PostgreSQL claim fixture and route fixtures cover competing cancellation/delivery transitions on selected handlers. Full concurrency coverage for every lifecycle endpoint and audit-history consistency remains open. |
| UI duplicate-submit guards and market/currency static contracts | Evidenced at source level only | PR #35 contains static regression contracts. These do not substitute for authenticated or concurrency tests. |
| Merge / deployment of PR #35 | Open | Keep draft until CI is green and required security tests are evidenced. Do not merge it as part of this dashboard audit. |

## Localisation and launch gates tracked by PR #12

| Gate | Status | Evidence / remaining action |
| --- | --- | --- |
| Source-level localisation and market feature contracts | Evidenced at source/CI level only | Existing contracts cover shared market behavior and country/currency rules; rerun against the intended release candidate. |
| Country-specific vehicle, registration, inspection and document rules | Open | Obtain authoritative requirements for each intended country, sub-jurisdiction, and vehicle class; preserve legacy GB records. |
| Pickup and drop-off time zones, including DST edges | Open for launch sign-off | Code and static contracts exist, but full authenticated browser/mobile evidence is not recorded here. |
| Payment provider and settlement/refund/reconciliation | Blocked | No real provider-backed checkout is connected. Do not collect real payments or describe pending records as settled. |
| Email verification delivery and expiry/replay behavior | Blocked / not tested | Configure a verified sender and provider in the secret manager; verify delivery, expiry, single-use tokens, resend throttling and protected actions. |
| Legal review, Terms and Privacy | Blocked | Drafts require operator details and qualified legal review for each intended market. |
| Authenticated browser/mobile E2E | Not tested | Run only on approved isolated staging fixtures after explicit authorization. |
| Backup and restore drill | Not tested | Confirm data ownership, retention, backup coverage, and a successful restore before real customer data. |
| Monitoring, alerting and operational recovery | Open | Reconcile current route-level 5xx counts; test alert delivery, rollback instructions, database connection limits, and recovery steps. |
| Second Railway PostgreSQL service ownership | Open | Contents and consumers remain unverified. Do not delete, migrate, or repoint it until ownership and all connection consumers are established. |
| Public launch | Blocked | Do not infer launch readiness from the successful staging deployment or synthetic QA statistics. |

## Safety constraints for follow-up work

- Preserve QA accounts, runs, events, reports, and failed-run evidence.
- Do not run QA campaigns, destructive cleanup, migrations, or manual deployments during this audit.
- Do not print or commit connection strings, passwords, bridge secrets, or session secrets.
- Treat successful staging health and read-only startup checks as bounded evidence, not proof of end-to-end production readiness.
