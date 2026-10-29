# Country-aware phone verification architecture

## Scope and current state

Post2Drive currently has email verification support but no end-to-end SMS/phone-verification flow. This document defines the server-side seam for adding SMS without coupling account market selection to the user's physical location.

- **UK first:** the GB (+44) provider slot is reserved for the selected UK SMS provider.
- **India prepared:** the IN (+91) provider slot is separate and remains disabled until an India-capable provider is selected.
- **Indian student QA:** students can test the GB + GBP marketplace from India. A +91 number routes to the India provider slot, independently of the selected marketplace. It must not be silently sent to a UK provider.
- **No provider selected:** no SMS adapter is registered and both routes report not ready. This is intentional fail-closed behavior; setting a provider-name environment variable alone does not activate sending.

## Routing rules

1. Normalize and validate the phone number to E.164 at the input boundary using a maintained phone-number library before calling the routing module.
2. Route by the number's validated calling code (+44 or +91), not IP geolocation, browser locale, or marketplace country.
3. Keep the account market (GB + GBP or IN + INR) separate from phone route. Phone calling code is not proof of residency or marketplace eligibility.
4. Never fall back across countries/providers if a route is unavailable. Return a retryable configuration/unavailable response instead.
5. Keep provider credentials server-side. Do not log raw phone numbers, OTPs, provider authorization headers, or verification tokens.

## Provider contract and next integration step

`lib/phoneVerification/provider.ts` defines a provider-neutral send/verify contract and country routing. It deliberately does not import a vendor SDK or send messages. After selecting the UK provider, add a server-only adapter implementing `PhoneVerificationProvider`, register it only for GB, and add sandbox integration tests. Add the India adapter separately when selected.

Before enabling phone verification in signup/login, implement persistent challenges with hashed OTPs, short expiry, one-time consumption, attempt/resend limits, per-phone and per-network throttling, and concurrency-safe verification. A provider delivery acknowledgement must not itself mark a phone verified.

## Indian student QA

Do not expose a production bypass or mark a phone verified simply because an account is a tester. The existing staging QA guard in `lib/qaRunnerGuard.ts` is a prerequisite for any future test-only adapter, but it is not sufficient on its own: the future adapter must also be explicitly configured for staging and restricted to approved test accounts/numbers. Do not return reusable OTPs from public endpoints or write test codes to logs.

Until that separate, guarded test adapter is implemented, students can continue testing existing UK-market flows that do not require SMS verification. Provider selection and SMS delivery must not be a prerequisite for their current QA signup.

## Environment configuration

- `POST2DRIVE_SMS_PROVIDER_GB`: provider identifier for the UK route; no adapter is currently registered.
- `POST2DRIVE_SMS_PROVIDER_IN`: provider identifier for the India route; no adapter is currently registered.

These values are configuration labels, not secrets. Store actual API keys in the hosting platform's secret manager. Keep both provider slots unset until their adapters and sandbox tests are ready.
