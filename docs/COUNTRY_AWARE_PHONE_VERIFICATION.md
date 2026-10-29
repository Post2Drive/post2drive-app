# Country-aware phone verification plan

## Scope

Post2Drive will integrate UK SMS first while keeping an independent India provider slot ready for later. Phone country is determined from a validated E.164 phone number, not IP address or selected marketplace. Marketplace identity (for example GB + GBP) remains independent, so Indian student testers can test the UK marketplace from India using their own +91 numbers.

## Current implementation status

- `lib/phoneVerification.ts` validates E.164-shaped input and routes +44 to the UK provider slot and +91 to the India provider slot.
- `POST2DRIVE_SMS_UK_PROVIDER` and `POST2DRIVE_SMS_INDIA_PROVIDER` are provider identifiers only. Setting either variable does not enable delivery or make the route ready.
- No SMS provider adapter is integrated. Both routes intentionally report not ready until an adapter is implemented and tested.
- Unknown calling codes and malformed phone numbers fail closed.
- Staging test mode is only eligible when `POST2DRIVE_STAGING_TEST_PHONE_VERIFICATION=true` and the existing isolated staging QA guard passes. This helper does not verify a user or bypass authentication by itself.

## Required next steps

1. Select a UK SMS provider and confirm UK delivery, sender/brand rules, pricing, rate limits, delivery callbacks, data processing terms and test/sandbox support.
2. Implement the provider adapter server-side, with secrets only in the environment secret store.
3. Add persistent phone-verification challenges with hashed OTPs, expiry, attempt counters, resend throttles and single-use atomic redemption. Never store or log raw OTPs.
4. Add explicit phone verification state to the account/user model and enforce it at the correct protected actions. Email verification must remain independent.
5. Build a controlled staging-only test adapter for named/approved QA tester accounts; it must never be available in production and must never mark a real phone number as verified outside staging.
6. Add provider sandbox integration tests, abuse/rate-limit tests, production-configuration fail-closed tests and an Indian-student QA flow using GB + GBP marketplace settings with a +91 number.
7. Select and integrate an India provider later without changing the UK adapter or UK authentication behavior.

## Environment configuration

- `POST2DRIVE_SMS_UK_PROVIDER`: provider identifier after selection; not a secret.
- `POST2DRIVE_SMS_INDIA_PROVIDER`: future provider identifier; leave unset until selected.
- `POST2DRIVE_STAGING_TEST_PHONE_VERIFICATION`: staging-only opt-in; ineffective unless every existing QA environment/database/URL guard passes.
- Provider API credentials must be separate environment secrets and must never be committed.

Do not enable live phone verification or claim that SMS is working until provider integration and end-to-end evidence pass on the exact deployed commit.
