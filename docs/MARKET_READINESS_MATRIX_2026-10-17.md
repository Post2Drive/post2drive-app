# Post2Drive market readiness matrix — 17 October 2026

## Decision rule

A market is **launch-ready only after** its code-level localisation contract passes, its country-specific authenticated staging campaigns pass, the relevant regional vehicle-jurisdiction and time-zone cases pass, a human reviewer signs off, and qualified local counsel reviews the intended launch scope. A registry entry or a shared euro currency is not evidence of legal or operational readiness.

## Evidence standard copied from the corrected GB/IN campaigns

Each market must complete these staging runs sequentially against the isolated staging database:

1. Synthetic account provisioning: 10,000 accounts.
2. API load: 14,000 checks, using the preserved synthetic account pool.
3. Authenticated workflow/E2E: 14,957 checks, using the preserved synthetic account pool.
4. Targeted country scenarios: market identity/currency isolation; signup/login and role boundaries; create/edit/search jobs; vehicle type and registration jurisdiction; pickup and drop-off time zones; date, money, weight and distance display; notifications; incident evidence; retry/idempotency; interrupted-job recovery.
5. Review the run summary and failure report; retain all evidence. Do not cleanup synthetic records automatically or manually as part of this qualification work.

The 10,000-account runner serializes runs globally. Do not queue multiple market campaigns concurrently. Use staging only; production is explicitly out of scope. The current QA trigger requires an authorised staging token, exact target confirmation and an isolated QA database. If those preconditions are unavailable, record the run as blocked rather than bypassing safeguards.

## Current baseline

- Registry and market-aware localisation profiles exist for 43 market codes.
- Code-level country-matrix and localisation contracts are intended to exercise all registry entries.
- The corrected full-size campaigns with recorded zero failures are **GB** and **IN** only.
- The latest drop-off time-zone implementation is in the feature branch and its contract test is in CI. Staging deployment/migration and authenticated browser behaviour must be verified for the current head.
- No other market is certified by the GB/IN results; cross-market behaviour must be tested per market.
- Terms/privacy, transport-authority terminology, vehicle classes and region-specific requirements require human/legal validation before external launch.

## Per-market qualification ledger

Status values: **Configured** means registry/profile code exists; **Campaign pending** means the three full-size authenticated staging runs below have not been evidenced for that market in this report; **Legal review pending** means local legal review has not been recorded here. These are not launch approvals.

| Code | Market | Currency | Registry/profile | Full-size staging campaign | Human/legal sign-off |
|---|---|---|---|---|---|
| GB | United Kingdom | GBP | Reference market | Passed earlier corrected campaign; rerun after current changes pending | Pending for current intended product scope |
| IN | India | INR | Reference market | Passed earlier corrected campaign; rerun after current changes pending | Pending for current intended product scope |
| AT | Austria | EUR | Configured | Campaign pending | Legal review pending |
| BE | Belgium | EUR | Configured; regional selection exists | Campaign pending | Legal/region review pending |
| BG | Bulgaria | EUR | Configured | Campaign pending | Legal review pending |
| HR | Croatia | EUR | Configured | Campaign pending | Legal review pending |
| CY | Cyprus | EUR | Configured | Campaign pending | Legal review pending |
| EE | Estonia | EUR | Configured | Campaign pending | Legal review pending |
| FI | Finland | EUR | Configured | Campaign pending | Legal review pending |
| FR | France | EUR | Configured; overseas time-zone options added | Campaign pending | Legal/territory review pending |
| DE | Germany | EUR | Configured | Campaign pending | Legal/vehicle-class review pending |
| GR | Greece | EUR | Configured | Campaign pending | Legal review pending |
| IE | Ireland | EUR | Configured | Campaign pending | Legal review pending |
| IT | Italy | EUR | Configured | Campaign pending | Legal/vehicle-class review pending |
| LV | Latvia | EUR | Configured | Campaign pending | Legal review pending |
| LT | Lithuania | EUR | Configured | Campaign pending | Legal review pending |
| LU | Luxembourg | EUR | Configured | Campaign pending | Legal review pending |
| MT | Malta | EUR | Configured | Campaign pending | Legal review pending |
| NL | Netherlands | EUR | Configured | Campaign pending | Legal review pending |
| PT | Portugal | EUR | Configured; Azores/Madeira time-zone options added | Campaign pending | Legal/territory review pending |
| SK | Slovakia | EUR | Configured | Campaign pending | Legal review pending |
| SI | Slovenia | EUR | Configured | Campaign pending | Legal review pending |
| ES | Spain | EUR | Configured; Canary Islands time-zone option added | Campaign pending | Legal/territory review pending |
| AD | Andorra | EUR | Configured | Campaign pending | Legal review pending |
| MC | Monaco | EUR | Configured | Campaign pending | Legal review pending |
| SM | San Marino | EUR | Configured | Campaign pending | Legal review pending |
| VA | Vatican City | EUR | Configured | Campaign pending | Legal review pending |
| XK | Kosovo | EUR | Configured | Campaign pending | Legal review pending |
| ME | Montenegro | EUR | Configured | Campaign pending | Legal review pending |
| CZ | Czechia | CZK | Configured | Campaign pending | Legal review pending |
| DK | Denmark | DKK | Configured; Faroe/Greenland time-zone options added | Campaign pending | Legal/territory review pending |
| HU | Hungary | HUF | Configured | Campaign pending | Legal review pending |
| IS | Iceland | ISK | Configured | Campaign pending | Legal review pending |
| NO | Norway | NOK | Configured | Campaign pending | Legal review pending |
| PL | Poland | PLN | Configured | Campaign pending | Legal review pending |
| RO | Romania | RON | Configured | Campaign pending | Legal review pending |
| SE | Sweden | SEK | Configured | Campaign pending | Legal review pending |
| CH | Switzerland | CHF | Configured; canton selection exists | Campaign pending | Legal/canton review pending |
| TR | Türkiye | TRY | Configured | Campaign pending | Legal review pending |
| US | United States | USD | Configured; state/time-zone selection exists | Campaign pending | State/vehicle-class legal review pending |
| CA | Canada | CAD | Configured; province/territory/time-zone selection exists | Campaign pending | Province/vehicle-class legal review pending |
| AU | Australia | AUD | Configured; state/territory/time-zone selection exists | Campaign pending | State/vehicle-class legal review pending |
| NZ | New Zealand | NZD | Configured; Chatham Islands time-zone option added | Campaign pending | Legal/territory review pending |

## Execution order

1. Finish and verify CI plus the current staging deployment/migration for the drop-off timezone changes.
2. Run the code-level all-market contracts on the exact head.
3. Run full-size staging campaigns sequentially for the non-reference markets, starting with markets whose region/time-zone cases are represented in the UI, and record each immutable run ID plus summary/failures.
4. Fix and rerun failed markets; preserve original failed-run evidence.
5. Complete app-wide copy review, jurisdiction-neutral vehicle data migration/backward compatibility, vehicle-class requirements, tax/pricing/provider review, and qualified legal review.
6. Have an independent reviewer check the complete diff and evidence. Keep the PR draft until all gates are evidenced.

## Guardrails

- Never claim that the 43-market registry means all 43 markets are launch-ready.
- Never treat a passing static contract as a substitute for authenticated E2E and recovery testing.
- Keep QA cleanup disabled; retain run summaries, events and synthetic records.
- Do not merge PR #12 or deploy to production as part of this qualification work.
