# Historical QA Stage Report — archived, not current deployment evidence

Last known validation window: 12–13 October 2026.

This document describes API-simulation results from the previous source repository and its former hosting setup. The previous hosting project was deliberately deleted during the clean-start reset on 16 October 2026. The target URLs, database, and service names from that environment are no longer current, and none of the results below certify the new `Post2Drive/post2drive-app` repository or any future deployment.

## Historical test results

The prior isolated QA run recorded 5,299/5,299 checks passing with a reported median check latency of 39 ms and p95 of 502 ms. It exercised synthetic user cohorts and several UK job lifecycle flows. This was API-driven testing, not browser-based usability testing or production load testing.

The sample size is not sufficient to establish the product's one-failure-per-million reliability objective. Email delivery, real payment settlement, provider callbacks, and independent production backup/restore were not verified end-to-end.

## Current status

- All former Railway projects and services were removed by the owner; new hosting is not configured in this repository.
- PostgreSQL and Redis data from the former environment were not exported into this repository.
- The QA runner is disabled unless the operator explicitly configures a staging-only deployment identity, HTTPS staging target, isolated QA database, and high-entropy `QA_RUN_TOKEN`.
- Do not reuse old URLs, old connection strings, historic runtime variables, or production data as test fixtures.
- Run the current validation workflow against a fresh disposable PostgreSQL database before creating a new staging deployment.

See [Launch Readiness](LAUNCH_READINESS.md) and [Reliability Standard](RELIABILITY_STANDARD.md) for current gates.
