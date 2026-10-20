# API Route Inventory — Post2Drive

**Inventory source:** recursive repository tree on `fix/user-side-market-workflows-audit` (50 route files found).
**Status:** inventory only. Priority indicates audit order, not a finding or proof of vulnerability. HTTP methods, guards and live behavior must be verified per route.
**Evidence labels:** static source / isolated test / live staging / independent review.

## Guardrails
- Do not call QA campaign start/run endpoints or mutate QA data during this inventory.
- Do not test destructive operations against real accounts or staging records.
- For every route, inspect every exported method, auth/session requirements, account/job/market scoping, request schema, rate limit, cache headers, side effects and failure paths.
- For mutation tests, assert the database state is unchanged after denied requests.
- Keep independent review and merge/deployment decisions separate.

## Route inventory

| Priority | Route file | Audit focus | Status |
|---|---|---|---|
| P0 | `app/api/account/access/route.ts` | Account access / entitlement | Not yet fully verified |
| P0 | `app/api/account/route.ts` | Account data, profile, deletion | Not yet fully verified |
| P0 | `app/api/admin/incidents/resolve/route.ts` | Admin incident mutation | Not yet fully verified |
| P0 | `app/api/admin/performance/route.ts` | Admin metrics | Not yet fully verified |
| P0 | `app/api/admin/qa-campaigns/[id]/route.ts` | QA campaign mutation | Not yet fully verified |
| P0 | `app/api/admin/qa-campaigns/[id]/start/route.ts` | Potentially destructive QA start | Not yet fully verified |
| P0 | `app/api/admin/qa-campaigns/access/route.ts` | QA access control | Not yet fully verified |
| P0 | `app/api/admin/qa-campaigns/route.ts` | QA campaign listing/mutation | Not yet fully verified |
| P1 | `app/api/admin/research/route.ts` | Research/admin data | Not yet fully verified |
| P0 | `app/api/admin/testers/route.ts` | Tester/admin mutation | Not yet fully verified |
| P0 | `app/api/auth/[...nextauth]/route.ts` | Authentication/session | Not yet fully verified |
| P1 | `app/api/email/verification/resend/route.ts` | Verification resend | Not yet fully verified |
| P0 | `app/api/email/verify/route.ts` | Verification token redemption | Not yet fully verified |
| P1 | `app/api/health/route.ts` | Health/readiness | Not yet fully verified |
| P0 | `app/api/internal/admin-bridge/route.ts` | Internal/admin bridge | Not yet fully verified |
| P0 | `app/api/jobs/[id]/accept/route.ts` | Job acceptance race/authorization | Not yet fully verified |
| P1 | `app/api/jobs/[id]/activity/route.ts` | Job activity disclosure | Not yet fully verified |
| P0 | `app/api/jobs/[id]/bid/route.ts` | Bid mutation | Not yet fully verified |
| P0 | `app/api/jobs/[id]/bids/[bidId]/accept/route.ts` | Bid acceptance race/authorization | Not yet fully verified |
| P0 | `app/api/jobs/[id]/bids/route.ts` | Bid disclosure/mutation | Not yet fully verified |
| P0 | `app/api/jobs/[id]/cancel/route.ts` | Cancellation race/authorization | Not yet fully verified |
| P0 | `app/api/jobs/[id]/confirm-delivered/route.ts` | Delivery confirmation | Not yet fully verified |
| P0 | `app/api/jobs/[id]/confirm-pickup/route.ts` | Pickup confirmation | Not yet fully verified |
| P0 | `app/api/jobs/[id]/driver-cancel/route.ts` | Driver cancellation | Not yet fully verified |
| P0 | `app/api/jobs/[id]/edit/route.ts` | Job edit/ownership | Not yet fully verified |
| P0 | `app/api/jobs/[id]/incidents/[incidentId]/evidence/[evidenceId]/route.ts` | Private evidence download | Not yet fully verified |
| P0 | `app/api/jobs/[id]/incidents/[incidentId]/evidence/route.ts` | Evidence upload | Not yet fully verified |
| P0 | `app/api/jobs/[id]/incidents/route.ts` | Incident creation/disclosure | Not yet fully verified |
| P0 | `app/api/jobs/[id]/incidents/terminate/route.ts` | Incident termination | Not yet fully verified |
| P0 | `app/api/jobs/[id]/incidents/updates/route.ts` | Incident updates | Not yet fully verified |
| P0 | `app/api/jobs/[id]/mark-delivered/route.ts` | Delivery state transition | Not yet fully verified |
| P0 | `app/api/jobs/[id]/payment/confirm-received/route.ts` | Payment state boundary | Not yet fully verified |
| P0 | `app/api/jobs/[id]/payment/mark-paid/route.ts` | Payment state boundary | Not yet fully verified |
| P0 | `app/api/jobs/[id]/reject-delivered/route.ts` | Delivery rejection | Not yet fully verified |
| P0 | `app/api/jobs/[id]/route.ts` | Job details/disclosure | Not yet fully verified |
| P0 | `app/api/jobs/[id]/unassign/route.ts` | Assignment mutation | Not yet fully verified |
| P0 | `app/api/jobs/route.ts` | Job search/create/market isolation | Not yet fully verified |
| P1 | `app/api/notifications/[id]/read/route.ts` | Notification ownership | Not yet fully verified |
| P1 | `app/api/notifications/route.ts` | Notification disclosure | Not yet fully verified |
| P1 | `app/api/payments/route.ts` | Payment UI/API semantics | Not yet fully verified |
| P1 | `app/api/promotion/referrals/progress/route.ts` | Referral disclosure | Not yet fully verified |
| P1 | `app/api/promotion/status/route.ts` | Promotion eligibility | Not yet fully verified |
| P0 | `app/api/qa/run/route.ts` | QA runner safety/environment isolation | Not yet fully verified |
| P1 | `app/api/ratings/route.ts` | Rating authorization/integrity | Not yet fully verified |
| P0 | `app/api/signup/route.ts` | Account creation/rate limits | Not yet fully verified |
| P1 | `app/api/subscription/create-payment/route.ts` | Payment provider boundary | Not yet fully verified |
| P0 | `app/api/subscription/webhook/route.ts` | Webhook signature/replay/idempotency | Not yet fully verified |
| P0 | `app/api/vehicles/route.ts` | Vehicle ownership/deletion guard | Not yet fully verified |
| P1 | `app/api/verification/start/route.ts` | Verification flow/payment claims | Not yet fully verified |
| P0 | `app/api/verification/start/webhook/route.ts` | Webhook authentication/idempotency | Not yet fully verified |

## Cross-cutting acceptance criteria
- [ ] No IDOR/BOLA across account, job, bid, vehicle, notification, incident, evidence, rating, payment, admin or QA resources.
- [ ] Cross-market reads and writes are denied server-side even with manipulated payloads.
- [ ] Anonymous and unauthorized requests do not mutate records.
- [ ] State transitions use transactional conditional writes and handle retries/races.
- [ ] Sensitive evidence and account data are private, non-cacheable and returned only to authorized parties.
- [ ] Signup/login/verification/webhooks/QA endpoints have appropriate rate limits, authentication, signature verification, replay protection and environment guards.
- [ ] Payment states are not represented as settlement without provider-backed evidence.
- [ ] Errors and logs avoid secrets, tokens, PII and raw request bodies.
- [ ] Every method has deterministic tests and relevant live smoke evidence before launch.
