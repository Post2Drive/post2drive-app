# Country architecture and signup policy

## Product rule

India is the only market exception. Every other configured market follows the shared international baseline currently piloted with the UK.

- Every account requires a phone number.
- India signup does not require email, person verification, company verification, company registration IDs, or a paid plan. The account name is a profile label only.
- India's sole platform verification gate is phone OTP. After OTP verification, users may view marketplace details, post jobs, and accept fixed-quote jobs without person/company verification or subscription expiry checks.
- India access is free by default. No India verification fee or subscription is charged.
- Every non-India market requires an email address. Where the existing email-verification feature flag is enabled, email verification is enforced for every non-India account.
- Email and phone verification are separate signals; one must never imply the other.
- Marketplace country/currency is selected independently from the phone number's calling code. A person in India can test the GB + GBP marketplace using a +91 number.

## Phone/SMS routing

- +44 uses the UK provider slot.
- +91 uses the India provider slot.
- Other calling codes are routed to a global provider slot only when they match a calling code configured in `lib/market.ts`.
- Provider identifiers are configuration labels, not proof of delivery. No route is ready until its server-side provider adapter and end-to-end tests are implemented.
- Unknown calling codes and malformed E.164-shaped values fail closed.

## Company and vehicle data

The platform should share common account and vehicle workflows, while choosing country-specific labels, identifiers, validation, jurisdiction and compliance requirements from the account's configured market.

- Company registration must use the local identifier type and rules for that country. Do not assume every country has a UK Companies House number or that a company ID applies to sole traders.
- Vehicle registration identifiers and registration authorities vary by country and sometimes by state/province/territory. Use the selected market and jurisdiction for labels and validation.
- Inspection and document requirements must be scoped by country, subnational jurisdiction and vehicle class, with exemptions and "not applicable" supported where appropriate. Do not apply UK V5C/MOT requirements globally.
- Existing schema fields such as `Account.companyNumber`, `Vehicle.regPlate`, `Vehicle.v5cDocumentUrl` and `Vehicle.motValidUntil` are legacy/generalisation work in progress. Keep existing GB records compatible while introducing jurisdiction-neutral fields and safe migration/backfill.
- Country-specific compliance cannot be declared complete solely because the UI label is localised. Validate rules against authoritative local sources before enabling requirements in production.

## India phone-only verification and access

The schema records `Account.phoneVerifiedAt`. Access helpers and posting/acceptance guards treat India + INR as free after this timestamp is set, and do not require person/company verification or verified vehicle status. The timestamp must only be set by a successful, single-use OTP redemption. Never set it during signup or based on a provider label.

The OTP delivery/verification endpoints and a real India SMS provider adapter are not yet integrated. Until that flow exists and is tested end-to-end, India accounts cannot complete the intended verification path. Do not deploy the policy change as a complete India launch.

## India email and account recovery

The database now permits a null email for India accounts. India phone login looks up the exact submitted phone within India accounts and fails closed when duplicate matches make the identity ambiguous. Existing email login continues to work for accounts that have an email.

Password reset is currently email-link based. An India account created without email cannot use that reset flow until a secure phone/SMS recovery path is implemented and tested. Do not launch email-less India signup to general users until account recovery is available, or provide a separately secured support recovery process.

## Rollout and validation

- Apply the nullable-email migration before deploying the updated signup/auth code.
- Run typecheck, QA contracts, Prisma generation/migration validation, signup/login tests for India with and without email, and non-India email-required tests.
- Test duplicate phone ambiguity, email uniqueness, existing-user login, verification links, and recovery behaviour.
- Keep all provider credentials in environment secrets. Do not mark SMS verification as live before a provider adapter, challenge lifecycle, rate limits and end-to-end evidence are present.
