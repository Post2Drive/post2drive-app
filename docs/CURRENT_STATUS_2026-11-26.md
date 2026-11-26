# Post2Drive current repository audit

**Audit date:** 26 November 2026  
**Scope:** read-only inspection of GitHub metadata and documentation, followed by documentation-only edits on a review branch.  
**Repositories:** `Post2Drive/post2drive-app` (canonical application) and `Post2Drive/Post2Drive` (project/profile and release-status record).

## Product identity

Post2Drive is a two-sided courier, delivery and freight marketplace. Customers and businesses post delivery jobs; drivers, couriers and fleet/transport operators discover, bid on and fulfil jobs. The current documented launch markets are the UK and India, with market and currency separation enforced by the application. Optional internal analytics and operational tooling support this marketplace; they are not separate customer-facing products.

Do not describe Post2Drive as a general simulation platform. Do not claim feature parity, external-market coverage, provider activation or production readiness unless the current implementation and evidence support it.

## GitHub evidence checked

### Canonical application — `Post2Drive/post2drive-app`

- Default branch: `main`.
- Latest main commit visible during this audit: `bf175a825a7aa10212a9efdb42a1a26dc5cfa154` (16 November 2026; rate-limits payment-declaration and notification-read routes).
- Combined status for that commit exposed one successful context: **Post2Drive - web**. This is not evidence that every required CI workflow, browser test, Android check or staging release gate passed.
- The open pull-request search returned dependency update PR #220 (Next.js 16.4.3 → 16.4.6). No open feature/documentation PR was returned in that search.
- The README, launch-readiness record, analytics specification, provider guide and operations-dashboard guide were reviewed for product framing, status claims and stale operational references.

### Project/profile repository — `Post2Drive/Post2Drive`

- Default branch: `main`.
- Latest main commit visible during this audit: `ad56c2dfc7d7328fb0d01a88da85610025c27b72` (25 November 2026), importing versioned public polling data with a per-file SHA-256 manifest and licence provenance. This is a repository data-asset change, not an application deployment.
- Open draft PR #3 is a dated repository/staging status audit. Its branch is 10 commits ahead and 1 behind current main, so its snapshot is stale relative to the current base.
- Open draft PR #4 vendors a security-audit skill. It is separate from the marketplace application and should be reviewed for provenance/licence and sandbox safety before any merge.
- Neither PR was merged or modified by this audit.

## Railway and deployment evidence

Railway was not inspected live in this audit. The repositories contain conflicting historical deployment statements: older project/profile notes say the staging services used `feature/country-localisation-audit`, while later application documentation says `main`. The current app repository default branch is `main`, but that alone does not prove the live Railway services are connected to it or deployed at its latest commit.

Therefore:
- Treat all dated Railway service, branch, deployment, database and environment-variable snapshots in older documents as historical until rechecked in Railway.
- Do not change service sources, variables, databases, volumes, deployment settings or production resources as part of this documentation work.
- A successful GitHub status context or historical Railway SUCCESS event is not a production-readiness signal.

## Product and release boundaries retained

- UK and India remain the documented launch markets; preserve strict country/currency isolation.
- Pricing, verification, subscriptions and launch-window rules must be described as owner-approved policy separately from code enforcement.
- Provider adapters may exist without being activated. The provider guide dated 14 November says no live message or payment has yet been sent; keep that distinction until controlled live tests are evidenced.
- Keep real payments, email verification, wider public access and production launch behind their existing owner and operational gates.
- Preserve synthetic QA evidence and historical failures. Do not clean up test history or change QA infrastructure during documentation edits.
- Keep the internal analytics service separate from the customer-facing marketplace and behind its documented access and least-privilege database controls.

## Editorial decisions applied in this review

- Preserve Post2Drive's marketplace identity and its documented UK/India launch scope.
- Remove competitor/platform comparison language from product-facing analytics documentation. Generic vendored design-tool guidance under `.agents/skills/` is third-party tooling material and is not treated as Post2Drive product copy.
- Make documentation navigation and evidence boundaries explicit.
- Keep source code, tests, database state, secrets, Railway configuration and production resources unchanged.

## Validation and limitations

- Reviewed current default-branch metadata, recent commits, open PRs, the combined status for the app main commit, and selected product/release documentation in both repositories.
- The only app-main status context returned by GitHub was successful; a full current CI matrix was not independently retrieved.
- No local checkout or shell execution was available in this connector-only pass. Markdown links were checked by path/reference review, not by a repository-wide link checker.
- No Railway runtime, browser/mobile E2E, database, provider or production verification was performed.
