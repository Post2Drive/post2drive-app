# Clean-start rebuild notes — 16 October 2026

This working tree was prepared from the downloaded `freight-app-main` archive, then updated to preserve the latest product decisions and harden the reset before the new repository is populated.

## Product and workflow scope carried forward

- UK-first delivery marketplace with UK/GBP and India/INR as separate supported markets.
- Country-first onboarding, vehicle-count-based Individual/Fleet plan selection, sole-trader-friendly naming, terms acceptance, and India market-research questions.
- UK job posting in a guided multi-step flow and India marketplace / My Requirements routes.
- Job lifecycle, bidding, notifications, incident reports and evidence, admin review, account access/deletion, privacy and terms pages.
- Subscription pricing remains the currently implemented UK model. Free-trial, weekly, pay-as-you-go, monthly and longer-plan combinations from the social poll remain research options until the product owner explicitly changes the commercial rules.

## Clean-start and security changes

- Removed assumptions that the old Railway production/staging URLs are valid. Capacitor remote-server mode now requires an explicit build-time `CAPACITOR_SERVER_URL`.
- Replaced old live-deployment claims in README/launch readiness docs with the actual clean-start state.
- Added server-side same-market enforcement to job-specific lifecycle, bid, payment, incident and evidence endpoints. Job creation and listing use the authenticated account's stored market; client-supplied currency is not authoritative.
- Added account-market-aware pickup-time resolution for job acceptance, bidding, bid acceptance and editing so India uses IST and UK uses `Europe/London` with daylight-saving gap/repeated-time rejection.
- Added contract checks for job-specific market guards, supported-market isolation, and market-aware pickup paths.
- Added executable tests for UK GMT/BST, India IST, impossible dates, and UK daylight-saving gaps/repeated times.
- Retained guarded QA cleanup and documented that destructive QA requires an explicitly isolated non-production target.
- Updated CI to cover `feature/**` branches, run contract/reliability checks, validate Prisma migrations against fresh PostgreSQL schemas, type-check and build.

## Verification status

Passed in the current working copy:

- `npm run qa:lifecycle-contract`
- `npm run qa:market-isolation`
- `npm run qa:market-timezone`
- `node scripts/qa/reliability-budget.mjs`
- Static structural check: every job-specific API route contains `requireJobMarketAccess`; brace counts match in those routes.

Not verified here:

- `npm ci` / full dependency resolution (network/package cache was unavailable in this environment).
- Prisma validation/client generation, full TypeScript type-check, production Next.js build, browser/mobile tests, or integration tests against a newly provisioned database.
- Real email delivery, payment-provider callbacks, and deployed staging tests.

Do not claim the application is production-ready until these remaining checks pass. No old database, secrets, or deployment URLs should be reconnected.
