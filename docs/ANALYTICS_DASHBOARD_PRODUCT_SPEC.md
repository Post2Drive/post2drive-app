# Post2Drive Analytics & Logistics Intelligence Dashboard

Status: product specification for the separate internal analytics service. This document does not claim the service is deployed or that any external market-data feed is connected.

## Product intent

Create a separate Railway service named **Post2Drive Analytics & Logistics Intelligence**. It is an internal operations and decision-support dashboard, not the customer-facing `/dashboard` page. The service should be independently visible as a service box beside the web app, PostgreSQL and Redis in the **staging** project first. Keep PR #12 draft; do not merge or deploy production as part of this work.

## Country selector and comparison

- A persistent country selector at the top, with a **Global / All markets** option and every supported market.
- Changing the selected country filters all first-party platform metrics, charts, tables, alerts, and insights to that market.
- Show the country name, currency, timezone, selected reporting window, last refreshed timestamp, and source coverage.
- Add a compare mode for two or more countries and a global benchmark; clearly label when comparisons are not statistically meaningful because data volume is low.
- Keep account country/currency server-authoritative. Do not infer market from IP, browser locale, or selected dashboard filter.
- Include time-window controls (24 hours, 7 days, 30 days, 90 days, and custom range where practical), previous-period comparisons, and CSV export of aggregated data only.

## Executive snapshot

KPI cards:
- Total registered accounts and total user profiles, with account vs user definitions kept distinct.
- New accounts and growth rate; active accounts/users (24h, 7d, 30d); retention and reactivation where event history supports it.
- Drivers, posters, mixed accounts, verified accounts and verification backlog.
- Total jobs posted, open jobs, accepted, in transit, delivered/completed, cancelled and completion/cancellation rates.
- Bids submitted, bid-to-accept conversion, time to first bid, time to accept, and jobs with no bids.
- Vehicle records and document/verification statuses where recorded.
- Subscription status, recorded payment attempts and outcomes, and declared job-payment statuses. Do not label recorded or declared payment records as settled revenue unless reconciled to a payment provider.
- API requests, median/P95 latency, 4xx/5xx counts and rates, uptime/health status where measured.
- QA runs: latest status, pass/fail counts, failed assertions, historical failures, duration, country coverage, and links to CI run evidence.

## Required visualizations

1. **Country overview:** account/job/activity KPIs, period-over-period deltas, and data-coverage indicator.
2. **Growth:** daily/weekly new accounts, active accounts, and cumulative growth.
3. **Marketplace liquidity:** jobs posted vs bids, jobs without bids, bid conversion, accepted/completed jobs, and time-to-first-bid by country.
4. **Supply and demand:** poster-to-driver ratio, vehicle types/capacity categories where available, route/region activity where addresses are privacy-safe and sufficiently aggregated.
5. **Job lifecycle funnel:** posted → bid received → accepted → in transit → delivered/completed, with drop-off and cancellation reasons when captured.
6. **API and service health:** request volume, latency distribution/P50/P95/P99 where supported, status-code trends, slowest endpoints, recent incidents, service deployment health and alert history.
7. **QA and tests:** pass rate over time, latest runs, failures by suite/country/scenario, duration trends, regression comparison, retained failure evidence, CI run links. Separate synthetic test data from business metrics; never clean up evidence automatically.
8. **Account and verification health:** account types, verification statuses, pending review, suspended/failed counts, signup conversion where instrumentation exists.
9. **Commercial:** subscription funnel and status, plan mix, recorded payment outcomes, conversion and renewal/expiry patterns. Distinguish recorded data from provider-confirmed settlement.
10. **Operational exceptions:** failed lifecycle transitions, duplicate/idempotency conflicts, stuck jobs, incident reports, notification delivery failures, missing or stale data.
11. **Country comparison:** indexed growth and conversion, activity per active account, supply/demand imbalance, completion and cancellation rates, and API reliability side-by-side.
12. **Market intelligence:** country-specific logistics industry size/growth, freight and parcel volumes, e-commerce demand, road/transport infrastructure, fuel and labour cost indicators, regulatory changes, cross-border trade, seasonal peaks, and competitor/platform signals where credible sources publish them.
13. **Trends and patterns:** seasonality, weekday/hour peaks, month-over-month changes, route/region concentration, demand/supply gaps, anomalous changes and emerging patterns. Only show forecasts when enough historical data exists; display confidence/limitations.
14. **Data sources and freshness:** every external indicator must show source, publication/observation date, retrieval date, geography, units, definition and link. Show "unavailable" rather than fabricate missing data.

## Market-intelligence source policy

- Use credible, country-specific public datasets: national statistics agencies, transport ministries/regulators, customs/trade statistics, central banks where relevant, and recognized industry reports.
- Examples of candidate sources to evaluate per country: Eurostat and European Commission transport statistics for European markets; UK Department for Transport and ONS; India's Ministry of Road Transport and Highways, MoSPI, DPIIT and RBI; US BTS/Census/Department of Transportation; Statistics Canada and Transport Canada; Australian Bureau of Statistics and BITRE; Stats NZ and New Zealand Ministry of Transport.
- These are candidate source families, not proof that every desired indicator has a usable API or current dataset. Record licensing, access method, publication cadence and comparability before integrating.
- Separate external industry indicators from Post2Drive's own usage. Do not imply the platform's small or early-stage dataset represents the whole country's logistics industry.
- Do not scrape behind logins or bypass access controls. Prefer official APIs, downloadable public datasets, licensed feeds or manually reviewed source links.

## Technical and security boundaries

- Separate read-only analytics service. Never expose the primary database directly to a public browser.
- Prefer a narrow, server-side, read-only metrics API or reporting views/materialized aggregates. Use a dedicated least-privilege database role; no write/delete permissions and no access to secrets or private payloads.
- If a separate analytics database is used, replicate only minimized aggregates and necessary events, not full personal data.
- Protect the internal service with authentication/access control (not the marketplace customer login by default, but never an unprotected public dashboard). Support an approved internal/admin identity boundary.
- Keep PII out of charts and exports; aggregate small cohorts and avoid exposing individual account records.
- Keep first-party metrics separated from synthetic QA metrics, and label all synthetic/test data.
- External industry data must include provenance and a clear as-of date.
- No changes to production or deployment until explicitly authorized. PR #12 remains draft.

## Delivery and acceptance criteria

1. A distinct service box appears in Railway staging, without changing the existing web, database, or Redis services.
2. Dashboard loads with a country selector, Global view, comparison mode, time window, refresh time and data-source status.
3. Selecting a country changes all applicable first-party charts/KPIs and external market-intelligence context, without mixing countries or currencies.
4. All metrics reconcile to documented source queries and definitions; test accounts are excluded from business totals but remain available in the QA section.
5. Tests/issues/API health, total users/accounts, jobs, bids, verification, subscriptions, incidents and all available data visuals are included.
6. QA history preserves failed runs and links to their evidence. No destructive cleanup is introduced.
7. Empty/insufficient/stale data is explicitly labelled; no invented figures, synthetic values presented as real, or unsupported forecasts.
8. Market insights show sources, timestamps, geography, definitions and coverage; unavailable country indicators are marked as gaps.
9. Access is protected, database access is read-only and least-privilege, and no secrets or personal data are exposed.
10. Build, contract tests, country filter tests, access-control tests, data-quality tests and deployment smoke tests pass in staging before launch review.
