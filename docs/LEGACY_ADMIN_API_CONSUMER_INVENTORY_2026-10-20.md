# Legacy admin performance API consumer inventory — 20 October 2026

## Repository-local findings

- `app/api/admin/performance/route.ts` remains a database-free HTTP 410 tombstone with `Cache-Control: no-store` and replacement path `/admin-access`.
- `app/admin/performance/page.tsx` redirects to `/admin-access`.
- The former `app/admin/performance/performance-dashboard.tsx` component contained a stale `fetch("/api/admin/performance?days=…")` caller. It was orphaned by the redirecting page and has been removed from this branch.
- `scripts/qa/legacy-admin-api-consumer-audit.mjs` scans tracked app/runtime source for the retired API path and dashboard component symbol, and verifies the tombstone and redirect. CI runs this audit.
- The replacement standalone dashboard uses its own `/admin-access/api/metrics` route. The app's `/api/internal/admin-bridge` requires a timestamp, nonce, HMAC signature, and replay protection; protected admin page routes redirect to `/admin-access`.

## Limits and remaining external checks

This establishes an in-repository runtime inventory only. Repository search cannot prove there are no consumers outside this repository. Before any eventual removal of the tombstone, an operator must check:
- reverse-proxy / CDN / access-log requests to the old path over a suitable observation window;
- monitoring probes, uptime checks, scheduled jobs and operational scripts;
- saved bookmarks or runbooks, and any third-party integrations or clients not stored in this repository.

Until those external checks are evidenced, keep the 410 tombstone. No staging endpoint was called and no staging data was changed for this inventory.
