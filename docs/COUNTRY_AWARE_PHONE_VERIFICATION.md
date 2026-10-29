# Country-aware phone verification plan

## Scope

Provider integrations are deliberately on hold across all markets until separately approved: this includes UK email delivery/verification and UK, India, and global SMS/phone verification. Do not select providers, add credentials, enable delivery, or claim verification is live as part of the current app-readiness work. Existing integration code may remain dormant; provider setup and end-to-end delivery are a separate future task. Phone country is determined from a validated E.164 phone number, not IP address or selected marketplace. Marketplace identity (for example GB + GBP) remains independent, so Indian student testers can test the UK marketplace from India using their own +91 numbers.

## Current implementation status

- `lib/phoneVerification.ts` validates E.164-shaped input and routes +44 to the UK slot, +91 to the India slot, and other configured market calling codes to a global slot.
- `POST2DRIVE_SMS_UK_PROVIDER` and `POST2DRIVE_SMS_INDIA_PROVIDER` are provider identifiers only. Setting either variable does not enable delivery or make the route ready.
- No SMS provider adapter is integrated. Both routes intentionally report not ready until an adapter is implemented and tested.
- Unknown calling codes and malformed phone numbers fail closed.
- Staging test mode is only eligible when `POST2DRIVE_STAGING_TEST_PHONE_VERIFICATION=true` and the existing isolated staging QA guard passes. This helper does not verify a user or bypass authentication by itself.

## Deferred provider work — do not start until approved

1. Select a UK SMS provider and confirm UK delivery, sender/brand rules, pricing, rate limits, delivery callbacks, data processing terms and test/sandbox support.
2. Implement the provider adapter server-side, with secrets only in the environment secret store.
3. Add persistent phone-verification challenges with hashed OTPs, expiry, attempt counters, resend throttles and single-use atomic redemption. Never store or log raw OTPs.
4. Add explicit phone verification state to the account/user model and enforce it at the correct protected actions. Email verification must remain independent.
5. Build a controlled staging-only test adapter for named/approved QA tester accounts; it must never be available in production and must never mark a real phone number as verified outside staging.
6. Add provider sandbox integration tests, abuse/rate-limit tests, production-configuration fail-closed tests and an Indian-student QA flow using GB + GBP marketplace settings with a +91 number.
7. Select and integrate an India provider later without changing the UK adapter or UK authentication behavior.

## Environment configuration

- `POST2DRIVE_SMS_UK_PROVIDER`: UK provider identifier; not a secret.
- `POST2DRIVE_SMS_INDIA_PROVIDER`: India provider identifier; leave unset until selected.
- `POST2DRIVE_SMS_GLOBAL_PROVIDER`: provider identifier for all other configured market calling codes; it does not imply delivery is ready.
- `POST2DRIVE_STAGING_TEST_PHONE_VERIFICATION`: staging-only opt-in; ineffective unless every existing QA environment/database/URL guard passes.
- Provider API credentials must be separate environment secrets and must never be committed.

Do not enable live phone verification or claim that SMS is working until provider integration and end-to-end evidence pass on the exact deployed commit.
