# Post2Drive documentation index

This index is the entry point for product, engineering, operations and release documentation. The application source and executable contracts remain authoritative for implemented behaviour; a specification or plan is not proof of implementation or deployment.

## Start here

- [Current repository audit — 26 November 2026](CURRENT_STATUS_2026-11-26.md): current GitHub evidence, documentation caveats and outstanding verification.
- [Launch readiness](LAUNCH_READINESS.md): release posture, dated evidence and launch gates.
- [Product purpose and workflows](APP_WORKFLOWS_AND_DASHBOARDS.md): marketplace purpose, account journeys, dashboards and operating workflows.
- [Product, account and verification policy](PRODUCT_AND_VERIFICATION_POLICY.md): approved account, verification, fee and subscription rules; distinguish policy from enforcement.
- [Analytics dashboard product specification](ANALYTICS_DASHBOARD_PRODUCT_SPEC.md): internal reporting product scope and data-governance requirements.
- [Provider integration](PROVIDER_INTEGRATION.md): email, SMS and payment adapters, activation conditions and controlled live-test requirements.
- [Railway staging setup](RAILWAY_STAGING_SETUP.md): staging configuration and operational cautions; verify live Railway state before acting.
- [Repository portability and deployment](REPOSITORY_PORTABILITY_AND_DEPLOYMENT.md): ownership continuity, backup, recovery, rollback and deployment procedures.
- [Vibrant design system](VIBRANT_DESIGN_SYSTEM.md): UI tokens and component conventions.

## Authority and evidence rules

1. Runtime source, schema, migrations and automated tests establish what is implemented.
2. Owner-approved product decisions establish intended policy; they do not establish that the policy is fully enforced.
3. CI results apply to the exact commit and workflow shown. A single successful status check is not a complete test-suite result.
4. Railway deployment state, environment variables, database targets and service health must be checked in Railway before being described as current.
5. Keep staging and production separate. Do not enable real payments, public launch or production changes without explicit owner approval.
6. Preserve dated historical incidents and failed QA evidence; do not rewrite historical records as if they were current.

## Scope

Post2Drive is a two-sided courier, delivery and freight marketplace. The current documented launch markets are the UK and India. This is not a general simulation platform. Product-facing documentation should describe Post2Drive's own workflows and capabilities without competitor comparisons or unsupported parity claims.
