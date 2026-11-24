# Neon cost reduction — Phase 1 (2026-11-24)

Baseline: 2026-11-01 through 23 UTC, 110.54 CU-h organization-wide, 105.85 CU-h playback (98.38 CU-h main). Last 72h sample had nonzero usage in every hourly bucket. Bot attribution is unverified.

## Scope
- Extend successful public Core games and sales catalog CDN TTL to 600 seconds. No cache on errors or degraded catalog.
- Public sitemap: 3600 seconds. Published notes and words: 300 seconds, no stale window.
- Preview responses remain uncached for these endpoints. No auth, private APIs, ads accounting, analytics writes, DB settings, cron schedules, schema or content changes.
- Public content changes may appear after TTL; emergency removal requires purge of affected CDN paths or deployment invalidation. Verify purge procedure before release; don't cache private drafts.
- Do not cache /api/games-live wholesale: it intentionally shuffles entries per request. Phase 2: public snapshots or bounded caching before shuffle.
- Existing public notes latest feed retains its separate 24h setting.

## Release checks
1. Verify syntax/build/preview deployment; avoid pointing preview writes at production.
2. On preview confirm public notes, words, sitemap, games list/search and sales catalog payloads and status codes are unchanged. Confirm no-store for preview, errors, redirects and 404s as applicable.
3. On approved production deployment confirm consecutive identical public GETs show CDN HIT / Age, correct TTL and no draft/private data. Check updates after expiry and cache purge for emergency unpublish. No repeated query-string cache-busting.
4. Compare 3–7 complete UTC days before/after for main CU-h/day and network transfer, and check error rates, public page freshness and normal editor workflows. Initial target main CU-h/day at least 30% lower, measured not promised. Roll back on regressions.
5. Phase 2: inventory public DB dependencies, static published snapshots and per-request shuffle, ad serving and tracking separately. No deletion of old projects until dependencies and backups verified.

