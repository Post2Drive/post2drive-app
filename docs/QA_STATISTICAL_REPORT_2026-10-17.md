# QA Statistical Report — 17 October 2026

## Scope and interpretation

This report records the final GB/IN staging campaign runs and a 24-hour Railway staging telemetry snapshot. It is evidence for staging QA only—not a production availability claim, launch approval, or proof that all markets behave identically.

Two denominators are kept separate:
- **QA-run checks:** scenario checks counted by the QA runner for each recorded run.
- **Railway HTTP requests:** proxy-level HTTP request counts. These include deliberately invalid/unauthenticated test requests and can include expected 5xx responses from disabled integrations. Do not treat the two datasets as interchangeable.

## Final successful campaign runs

| Market | Workload | Run ID | Recorded denominator | Recorded failures | Result |
|---|---|---|---:|---:|---|
| GB | Synthetic account provisioning | `20261017121602-154958fe-1b0e-499a-b9f2-72c808067aba` | 10,000 accounts | 0 | Pass |
| GB | API load | `20261017124301-2485c85f-eaf2-44a4-8884-21c9a8347489` | 14,000 checks | 0 | Pass |
| GB | Workflow/E2E | `20261017133410-4e4f29cf-700f-41a1-9652-aa464428d11e` | 14,957 checks | 0 | Pass |
| IN | Synthetic account provisioning | `20261017133556-6956bff4-acca-4135-97c6-be00584bfff7` | 10,000 accounts | 0 | Pass |
| IN | API load | `20261017134634-e6886202-de94-4d60-b5b9-cf38f9252b65` | 14,000 checks | 0 | Pass |
| IN | Workflow/E2E corrected rerun | `20261017143441-27ef0eb9-a19c-42e0-8f91-b723a621d925` | 14,957 checks | 0 | Pass |

The final successful sessions therefore recorded:
- **20,000** synthetic accounts provisioned.
- **28,000** API-load checks.
- **29,914** workflow/E2E checks.
- **57,914** API-load plus workflow/E2E checks, with zero runner-recorded failures in these final successful sessions.
- The India workflow/E2E corrected rerun reported **83 ms p95** latency. Do not generalise this one run's p95 to all endpoints, countries, or realistic user traffic; comparable p50/p95/p99 by route and run are not yet collated.

The counts above describe the final successful runs only. They do not erase earlier failure evidence.

## Preserved failed/incomplete evidence

| Run | Evidence | Statistical handling |
|---|---|---|
| GB API-load initial attempt — `20261017120644-b3d8f12b-9e2e-4d85-b6ec-6f872c92f0fa` | Prerequisite-ordering failure; no accounts created | Keep in the audit trail; do not combine with final successful-run failure rate. |
| IN workflow/E2E initial attempt — `20261017134748-3bddf454-584c-4fc1-b98e-35bdd2787caa` | 41 failed checks: 40 vehicle-jurisdiction payload omissions and one India weekly-subscription expectation mismatch | Keep as a genuine failed attempt; the subsequent corrected run passed. Its exact denominator is not confirmed in this report, so no failure percentage is asserted. |
| Older legacy run — `20261016231805-e00ccb61-affc-4fed-bb1-74e79485e002` | 136 accounts; no finish timestamp | Incomplete; exclude from completed-run rate calculations and preserve for investigation. |
| Local PowerShell report — `post2drive-qa-campaign-20261017-190314.json` | Incomplete because of a decryption exception | Do not use as a source of denominators or outcomes; cleanup was skipped. |

## Confidence bounds for zero-failure samples

The repository's reliability budget uses the **one-sided 95% exact binomial upper bound** for a sample with zero observed failures:

\[
p_{upper} = 1 - 0.05^{1/n}
\]

This is a mathematical bound under an independent, representative Bernoulli-trial model. QA scenarios are repeated and heterogeneous, so the table is a conservative reference for planning test volume—not an estimate of real production defect probability.

| Sample represented | n with zero recorded failures | 95% one-sided upper bound | Equivalent rate |
|---|---:|---:|---:|
| One synthetic-account run | 10,000 | 299.53 per million | About 1 in 3,339 |
| One API-load run | 14,000 | 213.96 per million | About 1 in 4,674 |
| One workflow/E2E run | 14,957 | 200.27 per million | About 1 in 4,993 |
| GB + IN API-load runs pooled for illustration | 28,000 | 106.98 per million | About 1 in 9,347 |
| GB + IN workflow/E2E runs pooled for illustration | 29,914 | 100.14 per million | About 1 in 9,986 |
| All API-load + workflow/E2E checks pooled for illustration | 57,914 | 51.73 per million | About 1 in 19,333 |

The pooled rows are **not** valid stand-alone reliability claims: endpoint mixes, repeated scenario templates, country differences and correlated requests violate or weaken the independence/representativeness assumptions. Keep the workload-specific results primary.

For the repository's aspirational statistical target of no more than **1 failure per million representative operations**, a zero-failure sample of **2,995,731 independent representative trials** is required for this 95% upper bound. For the comparison target of 1 per 100,000, the requirement is 299,572. Current QA volumes are valuable for finding regressions but do not statistically establish either very-low-risk target across the whole product.

## Railway staging HTTP telemetry (24-hour window)

Snapshot for Post2Drive Web in the Railway `staging` environment:

| HTTP class | Count | Share of 143,913 requests |
|---|---:|---:|
| 2xx | 89,806 | 62.40% |
| 3xx | 0 | 0.00% |
| 4xx | 53,552 | 37.21% |
| 5xx | 555 | 0.386% |
| **Total** | **143,913** | **100%** |

These are proxy-level counts, not QA-run pass/fail totals. The high 4xx proportion is consistent with large volumes of intentional negative/authentication/invalid-input tests in the campaign; 4xx still needs route-aware expected-versus-unexpected classification before a user-facing rate is reported.

The 555 5xx responses were bursty in the telemetry buckets: 141 in one bucket, then 138 in each of three other high-traffic buckets; the other reported buckets had zero 5xx. A limited sampled log window showed six 503 responses on `POST /api/verification/start/webhook`. The route-matrix contract explicitly allows `401` or `503` for an unsigned webhook, and the handler returns 503 when `VERIFICATION_WEBHOOK_SECRET` is not configured. This is an expected disabled-integration response in staging, but it is still counted as HTTP 5xx by the platform metric. The sampled log window is not a complete exhaustive enumeration of all 555 responses, so attribution of every 5xx to this endpoint remains unconfirmed.

**Action for monitoring:** keep raw 5xx visible, but distinguish expected test-only disabled-integration responses from unexpected 5xx by route and test-run correlation. Do not silently subtract or relabel them without retaining the raw count. Investigate any 5xx on unrelated routes and report both raw and classified rates.

## Railway Web resource metrics (24-hour summary)

| Metric | Current | Average | Maximum | Samples |
|---|---:|---:|---:|---:|
| CPU usage | 0 | 0.0364 | 1.7310 | 1,441 |
| CPU limit | 2 | 1.7044 | 2 | 1,441 |
| Memory usage | 0.097 GB | 0.0923 GB | 0.3227 GB | 1,441 |
| Memory limit | ~1.00 GB current | 0.8522 GB average | ~1.00 GB max | 1,441 |

The peak CPU sample was approximately 86.6% of the 2-unit current CPU cap; peak memory usage was about 0.323 GB, below the reported roughly 1 GB current memory cap. This is a time-aggregated staging snapshot, not a resource-per-request benchmark or evidence of production capacity. It should be correlated with individual test-run windows and route latency before making capacity decisions.

## Sampled route-level latency (not a full request export)

A limited Railway HTTP-log sample returned 501 requests over **2026-10-17 13:40–14:30 UTC**. These are log-sample statistics, not a full population percentile:

| Sample group | n | p50 | p95 | p99 | Maximum |
|---|---:|---:|---:|---:|---:|
| All sampled responses | 501 | 12 ms | 80 ms | 91 ms | 112 ms |
| 2xx/3xx | 84 | 30 ms | 89 ms | 112 ms | 112 ms |
| 4xx | 411 | 11 ms | 75 ms | 87 ms | 91 ms |
| 5xx | 6 | 5 ms | 46 ms | 46 ms | 46 ms |

The six 5xx samples were all `503` responses to `POST /api/verification/start/webhook`. The sample includes a large share of intentionally negative/authentication cases and is capped/limited by the log API. Therefore these percentiles must not be compared directly with the QA runner's **83 ms p95** from the corrected India workflow/E2E run, and must not be represented as public-user latency.

## Statistical gaps and next actions

1. Preserve the raw QA run summaries and per-event records; continue to keep cleanup disabled.
2. Export exact denominator, expected-status count, failed-check count, elapsed duration, p50/p95/p99 latency and status-code breakdown per run, workload, country and route. The current summary lacks comparable latency percentiles for five of the six final runs.
3. Correlate the 555 raw 5xx responses with route and QA run IDs. Keep the raw metric and a separately documented expected-test-response classification.
4. Report invalid-input/authentication outcomes separately from application failures; a 401/403/404/409/expected 400 can be a passing negative test.
5. Expand representative tests by jurisdiction and vehicle class. More repeated requests against a narrow scenario matrix do not replace coverage of distinct business workflows.
6. Re-run statistics on final, corrected runs only for regression comparison, while preserving and separately counting historical failed attempts.
7. Keep the merge and external-tester gates closed until the remaining localisation, jurisdiction/time-zone, legal, independent-review, authenticated-E2E, concurrency, evidence-restore and operational-recovery gates are evidenced.

**Decision:** the final GB/IN campaign runs passed their recorded QA checks, but statistical evidence is not yet sufficient to claim a one-in-a-million failure probability or production readiness. Raw 5xx telemetry requires route-aware interpretation, and full per-run latency/status breakdown is still outstanding.
