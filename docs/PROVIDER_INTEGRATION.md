# Provider integration

**Status (14 Nov 2026):** adapters for email (Resend), SMS (Twilio, MSG91) and subscription checkout (Stripe) are implemented and contract-tested (`npm run qa:provider-adapters`). None is switched on: each activates only when its credentials are set, and fails closed without them. **No live message or payment has been sent yet**; a controlled live test per provider is still required before launch.

## Switching a provider on (owner steps)

| Service | Set these variables | Then |
|---|---|---|
| Email (Resend) | `RESEND_API_KEY`, `EMAIL_FROM` (verified sending domain), `EMAIL_VERIFICATION_ENABLED=true` | Sign up with a new address; confirm the verification and password-reset emails arrive. |
| SMS, UK numbers | `POST2DRIVE_SMS_UK_PROVIDER=twilio`, `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`, and `TWILIO_MESSAGING_SERVICE_SID` or `TWILIO_FROM` | Verify a UK mobile from Account settings. |
| SMS, India numbers | `POST2DRIVE_SMS_INDIA_PROVIDER=msg91`, `MSG91_AUTH_KEY`, `MSG91_OTP_TEMPLATE_ID` (DLT-approved OTP template) | Sign in by phone code with an Indian number. |
| Subscription checkout (Stripe) | `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` | In Stripe add the webhook endpoint `https://<site>/api/subscription/webhook/stripe` with events `checkout.session.completed`, `checkout.session.async_payment_succeeded`, `checkout.session.async_payment_failed`, `checkout.session.expired`, `charge.refunded`. Pay once in test mode and confirm access starts. |

On staging the SMS test outbox takes priority while `POST2DRIVE_STAGING_TEST_PHONE_VERIFICATION=true`; turn it off to test a real carrier. The server logs a one-line "Provider readiness" report at start-up (states only, never values). With `DEPLOYMENT_ENVIRONMENT=production` the server refuses to start if a required setting is missing, a test switch is on, or Stripe test keys are used (`lib/providerReadiness.ts`).

## How payments are kept safe

- Plan, amount and currency are calculated on the server; nothing about the price comes from the browser.
- One access period = one pending payment = one Stripe Checkout session (idempotency key `p2d-checkout-<paymentId>`).
- A payment becomes **paid only from a signature-verified webhook** (HMAC over the raw body, 5-minute replay window). Returning from the checkout page changes nothing.
- Every verified event is written to `PaymentProviderEvent` with a unique `(provider, eventId)`, so redelivery is a no-op.
- The paid amount, currency and account must match the stored payment, or the event is recorded as rejected and logged for manual review.
- Full refund: the payment is marked refunded and only the access that payment added is removed. Partial refund: recorded, access unchanged.
- No automatic renewals: the user pays each period. Job money between poster and driver is never processed by Post2Drive.
- The older shared-secret hook (`/api/subscription/webhook`) is a staging test aid and returns 404 in production.

## Still open

- Live test-mode run for each provider on staging (needs the owner's provider accounts).
- Identity/company verification provider: the webhook still uses a shared header secret; replace with the chosen provider's signature scheme.
- Stripe account country/entity, tax (VAT) settings and receipts are owner decisions.
- India charges nothing today; a Razorpay adapter is only needed if that changes.

---

## Background: original design rules

## Boundaries

- `lib/providerContracts.ts` defines typed boundaries for transactional email, SMS OTP, checkout creation, and verified payment events.
- `lib/emailProvider.ts` contains the configurable Resend adapter and fails closed when unconfigured; it does not log provider response bodies.
- `lib/providerLifecycle.ts` contains OTP expiry/cooldown/attempt/single-use rules and a payment-event validation boundary. Its in-memory store is test-only; production OTP storage must be durable and its `consume` operation atomic.
- `scripts/qa/provider-lifecycle-contract.mjs` is included in `qa:all` for provider-unconfigured, OTP expiry/cooldown/attempt/single-use, and payment replay/amount/currency checks.
- Existing account, market, pricing, and job logic remains authoritative. Adapters must not decide eligibility or calculate prices.
- Provider delivery acceptance is not proof that a message was received or a payment settled.
- A production adapter is unavailable until it is implemented, registered, configured with secrets in the deployment secret store, and tested.
- Test fakes must be injected by tests; never activate fake success using a production environment variable or silently fall back to a fake provider.

## Earlier implementation notes (superseded by the status above where they differ)

- Existing email verification and password reset functions now call the provider-independent email delivery interface. Their token creation, SHA-256/HMAC hashing, 24-hour/1-hour expiry, and token-use database guards were preserved. Existing cooldown/invalidation logic was not redesigned.
- OTP currently has a store interface and an explicitly test-only in-memory implementation. It is **not production-ready** until a Prisma-backed store, atomic consume/update, delivery adapter call, API endpoints, and account `phoneVerifiedAt` transition are wired and tested. No test code or OTP is exposed to production users.
- Payment validation primitives reject unverified events and amount/currency mismatch and require event IDs for deduplication. They are **not yet wired** to the existing subscription webhook or a durable unique event ledger. Do not interpret this as payment-provider integration or live settlement readiness.
- Keep India access free after phone OTP with no person/company verification fee. UK pricing/verification remains separate.

## Email: account verification and password reset

- Keep token creation, hashing, expiry, single-use enforcement, resend invalidation/cooldown, account/session rules, and callback validation in application logic.
- Move provider-specific HTTP request/response parsing behind a `TransactionalEmailProvider` adapter without changing existing security behavior.
- Tests: delivery accepted/rejected/unconfigured, no token leakage in logs, safe provider errors, HTML escaping, plain-text formatting, expiry, single-use, resend cooldown/concurrency, verification callback, and reset callback.
- Live delivery remains blocked until a sending domain is verified, credentials are stored securely, and controlled staging delivery is proven.

## Phone OTP

- Keep phone normalization in E.164 and route by phone calling code, not marketplace country or IP.
- Use the existing UK, India, and global provider slots; provider selection alone must not mean ready.
- OTP lifecycle must use cryptographically random codes, hashed-at-rest verification material, expiry, one-time consumption, bounded attempts, resend cooldown, rate limiting, and account-level concurrency controls.
- Never log OTPs. A test adapter must be deterministic and isolated to automated tests/explicit QA guards.
- India access remains free after phone OTP; no person/company verification fee. Do not silently apply UK checks or pricing to India.
- Live SMS remains unverified until a provider is selected and controlled tests pass.

## Payments

- Keep pricing and entitlements in application code. Use integer minor units and validate currency/amount against the server-calculated plan; never trust client-supplied amount/currency.
- Create checkout with an idempotency key. Mark payment states only from an authenticated provider event or a documented reconciliation process.
- Verify webhook signatures against the raw request body, reject replays/duplicates, and handle failure, cancellation, refunds, delayed events, and reconciliation idempotently.
- Do not claim charge, refund, payout, or settlement without provider-backed evidence. No real charges until an adapter and end-to-end tests pass.

## Required automated coverage before adapter work is considered ready

- Compile-time contract validation and tests for unconfigured provider behavior.
- Market parity: India free + phone OTP; UK and other priced markets retain their existing plan rules.
- No fake-success path in production configuration.
- Email/SMS token and OTP lifecycle, throttling, expiry, replay and concurrency.
- Payment amount/currency tampering, duplicate and forged webhooks, idempotency, refunds, and delayed/out-of-order events.
- All checks must pass on the exact candidate commit. Live provider tests are separate release evidence.

