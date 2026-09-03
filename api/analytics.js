import { neon } from '@neondatabase/serverless';

const STAGING_ANALYTICS_URL = 'https://ways-analytics-staging.vercel.app/api/analytics';

const intParam = (value, fallback, min, max) => {
  const n = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

const cleanPage = value => String(value || '').trim().slice(0, 64);
const shouldUseProductionDb = () => process.env.VERCEL_ENV === 'production';

async function proxyToStaging(req, res) {
  try {
    const params = new URLSearchParams();
    if (req.query?.days != null) params.set('days', String(req.query.days));
    if (req.query?.device != null) params.set('device', String(req.query.device));
    if (req.query?.page != null) params.set('page', String(req.query.page));
    const url = `${STAGING_ANALYTICS_URL}${params.size ? `?${params.toString()}` : ''}`;
    const upstream = await fetch(url, { headers: { accept: 'application/json' } });
    const text = await upstream.text();
    res.status(upstream.status);
    try { return res.json(JSON.parse(text)); } catch { return res.end(text); }
  } catch (error) {
    console.error('[ways-analytics-staging-proxy]', error?.message || error);
    return res.status(502).json({ ok: false, error: 'staging_proxy_failed' });
  }
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'method_not_allowed' });

  if (!shouldUseProductionDb()) return proxyToStaging(req, res);

  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) return res.status(503).json({ ok: false, error: 'database_not_configured' });

  const days = intParam(req.query?.days, 7, 1, 365);
  const device = ['desktop','mobile'].includes(req.query?.device) ? req.query.device : '';
  const page = cleanPage(req.query?.page);

  try {
    const sql = neon(connectionString);
    const [summaryRows, gameRows, deviceRows, attributionRows] = await Promise.all([
      sql`
        WITH filtered AS (
          SELECT * FROM public.ways_analytics_events
          WHERE occurred_at >= now() - (${days} * interval '1 day')
            AND (${device} = '' OR device = ${device})
            AND (${page} = '' OR page = ${page})
        )
        SELECT
          count(*) FILTER (WHERE event_name = 'page_view')::int AS page_views,
          count(DISTINCT session_id)::int AS sessions,
          count(*) FILTER (WHERE event_name = 'view')::int AS game_views,
          count(*) FILTER (WHERE event_name = 'plays')::int AS plays_legacy,
          count(*) FILTER (WHERE event_name = 'play')::int AS plays,
          count(*) FILTER (WHERE event_name = 'complete')::int AS completes,
          count(*) FILTER (WHERE event_name = 'store_click')::int AS store_clicks,
          count(*) FILTER (WHERE event_name = 'article_click')::int AS article_clicks,
          count(*) FILTER (WHERE event_name = 'tag_click')::int AS tag_clicks,
          count(*) FILTER (WHERE event_name = 'content_click')::int AS content_clicks,
          count(*) FILTER (WHERE event_name = 'filter_change')::int AS filter_changes,
          count(*) FILTER (WHERE event_name = 'search')::int AS searches
        FROM filtered
      `,
      sql`
        WITH filtered AS (
          SELECT * FROM public.ways_analytics_events
          WHERE occurred_at >= now() - (${days} * interval '1 day')
            AND (${device} = '' OR device = ${device})
            AND (${page} = '' OR page = ${page})
            AND game_id IS NOT NULL
        )
        SELECT
          game_id,
          count(*) FILTER (WHERE event_name = 'view')::int AS views,
          count(DISTINCT session_id) FILTER (WHERE event_name = 'view')::int AS viewers,
          count(*) FILTER (WHERE event_name = 'play')::int AS plays,
          count(*) FILTER (WHERE event_name = 'p50')::int AS p50,
          count(*) FILTER (WHERE event_name = 'complete')::int AS completes,
          count(*) FILTER (WHERE event_name = 'store_click')::int AS store_clicks,
          count(*) FILTER (WHERE event_name = 'article_click')::int AS article_clicks,
          count(*) FILTER (WHERE event_name = 'tag_click')::int AS tag_clicks,
          count(*) FILTER (WHERE event_name = 'content_click')::int AS content_clicks,
          round(coalesce(avg(progress) FILTER (WHERE event_name = 'view_end'), 0), 1)::text AS avg_watch_pct
        FROM filtered
        GROUP BY game_id
        ORDER BY store_clicks DESC, content_clicks DESC, views DESC, game_id ASC
      `,
      sql`
        SELECT device, count(DISTINCT session_id)::int AS sessions
        FROM public.ways_analytics_events
        WHERE occurred_at >= now() - (${days} * interval '1 day')
          AND (${page} = '' OR page = ${page})
        GROUP BY device
        ORDER BY sessions DESC
      `,
      sql`
        WITH filtered AS (
          SELECT * FROM public.ways_analytics_events
          WHERE occurred_at >= now() - (${days} * interval '1 day')
            AND (${device} = '' OR device = ${device})
            AND (${page} = '' OR page = ${page})
        )
        SELECT
          coalesce(nullif(metadata->>'utm_source',''), 'direct') AS utm_source,
          coalesce(nullif(metadata->>'utm_medium',''), 'none') AS utm_medium,
          coalesce(metadata->>'utm_campaign','') AS utm_campaign,
          coalesce(metadata->>'utm_content','') AS utm_content,
          coalesce(metadata->>'referrer_host','') AS referrer_host,
          count(*) FILTER (WHERE event_name = 'page_view')::int AS page_views,
          count(DISTINCT session_id)::int AS sessions,
          count(*) FILTER (WHERE event_name = 'view')::int AS game_views,
          count(*) FILTER (WHERE event_name IN ('play','plays'))::int AS plays,
          count(*) FILTER (WHERE event_name = 'complete')::int AS completes,
          count(*) FILTER (WHERE event_name = 'store_click')::int AS store_clicks
        FROM filtered
        GROUP BY 1,2,3,4,5
        ORDER BY sessions DESC, page_views DESC, game_views DESC
        LIMIT 50
      `
    ]);

    const raw = summaryRows[0] || {};
    const summary = {
      page_views: Number(raw.page_views || 0),
      sessions: Number(raw.sessions || 0),
      game_views: Number(raw.game_views || 0),
      plays: Number(raw.plays || 0) + Number(raw.plays_legacy || 0),
      completes: Number(raw.completes || 0),
      store_clicks: Number(raw.store_clicks || 0),
      article_clicks: Number(raw.article_clicks || 0),
      tag_clicks: Number(raw.tag_clicks || 0),
      content_clicks: Number(raw.content_clicks || 0),
      filter_changes: Number(raw.filter_changes || 0),
      searches: Number(raw.searches || 0)
    };

    return res.status(200).json({
      ok: true,
      days,
      page: page || 'all',
      device: device || 'all',
      summary,
      devices: deviceRows,
      attribution: attributionRows,
      games: gameRows
    });
  } catch (error) {
    console.error('[ways-analytics]', error?.message || error);
    return res.status(500).json({ ok: false, error: 'analytics_failed' });
  }
}
