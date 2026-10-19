# Legacy admin performance API consumer inventory — 20 October 2026

## Repository-local findings

- `app/api/admin/performance/route.ts` remains a database-free HTTP 410 tombstone with `Cache-Control: no-store` and replacement path `/admin-access`.
- `app/admin/performance/page.tsx` redirects to `/admin-access`.
- The former `app/admin/performance/performance-dashboard.tsx` component contained a stale `fetch("/api/admin/performance?days=…")` caller. It was orphaned by the redirecting page and has been removed from this branch.
- `scripts/qa/legacy-admin-api-consumer-audit.mjs` scans tracked app/runtime source for the retired API path and dashboard component symbol, and verifies the tombstone and redirect. CI runs this audit.
- The replacement standalone dashboard uses its own `/admin-access/api/metrics` route. The app's `/api/internal/admin-bridge` requires a timestamp, nonce, HMAC signature, and replay protection; protected admin page routes redirect to `/admin-access`.

## Read-only Railway HTTP log check

- Inspected the Post2Drive Web staging service's Railway HTTP proxy logs from 2026-10-19 19:40 UTC through 2026-10-20 21:06 UTC. The returned sample contained 34 HTTP entries and **zero** requests to `/api/admin/performance` after the tombstone deployment.
- A broader returned sample contained 10 requests to that path on 2026-10-18 around 21:29 UTC, alternating HTTP 401 and 403. Their timing/status pattern matches the two old authenticated/unauthenticated QA route-matrix probes, which this branch changes to expect HTTP 410.
- This is bounded proxy-log evidence, not proof of zero consumers over all time or in third-party systems. No request IPs or user-agent data are copied into this inventory.

## Limits and remaining external checks

This establishes an in-repository runtime inventory only. Repository search cannot prove there are no consumers outside this repository. Before any eventual removal of the tombstone, an operator must check:
- reverse-proxy / CDN / access-log requests to the old path over a suitable observation window;
- monitoring probes, uptime checks, scheduled jobs and operational scripts;
- saved bookmarks or runbooks, and any third-party integrations or clients not stored in this repository.

Until those external checks are evidenced, keep the 410 tombstone. No staging endpoint was called and no staging data was changed for this inventory.
