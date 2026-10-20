# Localisation Core Handoff

## Scope
This branch isolates customer-facing localisation primitives from the broad PR #12 branch, which also includes QA administration/worker, operations dashboard, database schema/migrations and payment/job workflow changes. This is an isolated base, not launch certification.

## Included
- Canonical market registry for 43 country/currency/locale/timezone identities.
- Market mismatch rejects instead of silently defaulting to another country.
- Strict calendar-date parsing for date-input values.
- Forward-only nullable migrations for vehicle registration jurisdiction and pickup/drop-off timezone metadata.

## Remaining gates
- Local vehicle labels and document guidance do not certify legal compliance.
- Vehicle weight handling stores kilograms while some markets may display pounds; a reviewed conversion/data semantics design is still needed.
- Multiple-time-zone countries need a defensible origin/destination time/date model; timezone metadata alone does not solve destination-day rollover.
- Payment and email providers, reconciliation and local legal review remain separate gates.
- Test migrations on a clean disposable PostgreSQL database and disposable staging-schema copy before release. Do not execute migrations against live staging as part of this branch.
