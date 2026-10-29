# Provider-independent integration plan

**Status:** email sends now route through a configurable provider adapter; OTP lifecycle and payment-event integrity primitives plus contract tests are added. Persistent OTP storage, route integration, durable webhook deduplication, and provider-backed checkout/webhook integration remain pending.
**Rule:** no credentials, provider selection, deployment, or production configuration is required to complete this phase.

## Boundaries

- `lib/providerContracts.ts` defines typed boundaries for transactional email, SMS OTP, checkout creation, and verified payment events.
- `lib/emailProvider.ts` contains the configurable Resend adapter and fails closed when unconfigured; it does not log provider response bodies.
- `lib/providerLifecycle.ts` contains OTP expiry/cooldown/attempt/single-use rules and a payment-event validation boundary. Its in-memory store is test-only; production OTP storage must be durable and its `consume` operation atomic.
- `scripts/qa/provider-lifecycle-contract.mjs` is included in `qa:all` for provider-unconfigured, OTP expiry/cooldown/attempt/single-use, and payment replay/amount/currency checks.
- Existing account, market, pricing, and job logic remains authoritative. Adapters must not decide eligibility or calculate prices.
- Provider delivery acceptance is not proof that a message was received or a payment settled.
- A production adapter is unavailable until it is implemented, registered, configured with secrets in the deployment secret store, and tested.
- Test fakes must be injected by tests; never activate fake success using a production environment variable or silently fall back to a fake provider.

## Implementation status and remaining integration work

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

## Release status

This document and the type contracts are preparatory architecture only. They do not implement provider adapters, configure credentials, prove email/SMS delivery, authorize real payments, or clear a release gate. Keep provider configuration and live transaction tests as explicit follow-up work after providers are selected.
