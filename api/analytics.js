import { neon } from '@neondatabase/serverless';

const STAGING_ANALYTICS_URL = 'https://ways-analytics-staging.vercel.app/api/analytics';

const intParam = (value, fallback, min, max) => {
  const n = Number.parseInt(String(value ?? ''), 10);
  return Number.isFinite(n) ? Math.min(max, Math.max(min, n)) : fallback;
};

const cleanPage = value => String(value || '').trim().slice(0, 64);
const shouldUseProductionDb = () => process.env.VERCEL_ENV === 'production';
const num = value => Number(value || 0);
const rate = (part, whole) => whole > 0 ? Math.round((part / whole) * 1000) / 10 : null;

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
    const retentionPage = page || 'ways';
    const [summaryRows, gameRows, deviceRows, attributionRows, repeatRows, cohortRows] = await Promise.all([
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
      `,
      sql`
        WITH pv AS (
          SELECT
            metadata->>'visitor_id' AS visitor_id,
            occurred_at,
            (occurred_at AT TIME ZONE 'Asia/Tokyo')::date AS active_date
          FROM public.ways_analytics_events
          WHERE event_name = 'page_view'
            AND page = ${retentionPage}
            AND (${device} = '' OR device = ${device})
            AND nullif(metadata->>'visitor_id','') IS NOT NULL
        ),
        first_seen AS (
          SELECT visitor_id, min(occurred_at) AS first_at
          FROM pv
          GROUP BY visitor_id
        ),
        in_window AS (
          SELECT p.visitor_id,
                 count(DISTINCT p.active_date)::int AS active_days,
                 min(f.first_at) AS first_at
          FROM pv p
          JOIN first_seen f USING (visitor_id)
          WHERE p.occurred_at >= now() - (${days} * interval '1 day')
          GROUP BY p.visitor_id
        )
        SELECT
          count(*)::int AS visitors,
          count(*) FILTER (WHERE active_days >= 2)::int AS repeat_visitors,
          count(*) FILTER (WHERE first_at >= now() - (${days} * interval '1 day'))::int AS new_visitors,
          count(*) FILTER (WHERE first_at < now() - (${days} * interval '1 day'))::int AS returning_visitors
        FROM in_window
      `,
      sql`
        WITH pv AS (
          SELECT
            metadata->>'visitor_id' AS visitor_id,
            occurred_at,
            (occurred_at AT TIME ZONE 'Asia/Tokyo')::date AS active_date,
            coalesce(metadata->>'utm_source','') AS utm_source,
            coalesce(metadata->>'utm_medium','') AS utm_medium,
            coalesce(metadata->>'utm_campaign','') AS utm_campaign,
            coalesce(metadata->>'utm_content','') AS utm_content
          FROM public.ways_analytics_events
          WHERE event_name = 'page_view'
            AND page = ${retentionPage}
            AND (${device} = '' OR device = ${device})
            AND nullif(metadata->>'visitor_id','') IS NOT NULL
        ),
        first_touch AS (
          SELECT DISTINCT ON (visitor_id)
            visitor_id,
            occurred_at AS first_at,
            active_date AS first_date,
            utm_source,
            utm_medium,
            utm_campaign,
            utm_content
          FROM pv
          ORDER BY visitor_id, occurred_at ASC
        ),
        calc AS (
          SELECT
            f.*,
            EXISTS (
              SELECT 1 FROM pv p
              WHERE p.visitor_id = f.visitor_id
                AND p.active_date > f.first_date
                AND p.active_date <= f.first_date + 7
            ) AS retained_7d,
            EXISTS (
              SELECT 1 FROM pv p
              WHERE p.visitor_id = f.visitor_id
                AND p.active_date > f.first_date
                AND p.active_date <= f.first_date + 30
            ) AS retained_30d,
            (
              SELECT count(DISTINCT p.active_date)
              FROM pv p
              WHERE p.visitor_id = f.visitor_id
                AND p.active_date >= f.first_date
                AND p.active_date <= f.first_date + 30
            ) >= 3 AS habitual_30d
          FROM first_touch f
        )
        SELECT
          coalesce(nullif(utm_campaign,''), '(no campaign)') AS campaign,
          coalesce(nullif(utm_source,''), 'direct') AS source,
          coalesce(nullif(utm_medium,''), 'none') AS medium,
          min(first_date)::text AS cohort_start,
          count(*)::int AS visitors,
          count(*) FILTER (WHERE first_date <= (now() AT TIME ZONE 'Asia/Tokyo')::date - 7)::int AS mature_7d,
          count(*) FILTER (WHERE first_date <= (now() AT TIME ZONE 'Asia/Tokyo')::date - 7 AND retained_7d)::int AS retained_7d,
          count(*) FILTER (WHERE first_date <= (now() AT TIME ZONE 'Asia/Tokyo')::date - 30)::int AS mature_30d,
          count(*) FILTER (WHERE first_date <= (now() AT TIME ZONE 'Asia/Tokyo')::date - 30 AND retained_30d)::int AS retained_30d,
          count(*) FILTER (WHERE first_date <= (now() AT TIME ZONE 'Asia/Tokyo')::date - 30 AND habitual_30d)::int AS habitual_30d
        FROM calc
        GROUP BY 1,2,3
        ORDER BY min(first_date) DESC, visitors DESC
        LIMIT 60
      `
    ]);

    const raw = summaryRows[0] || {};
    const repeat = repeatRows[0] || {};
    const summary = {
      page_views: num(raw.page_views),
      sessions: num(raw.sessions),
      game_views: num(raw.game_views),
      plays: num(raw.plays) + num(raw.plays_legacy),
      completes: num(raw.completes),
      store_clicks: num(raw.store_clicks),
      article_clicks: num(raw.article_clicks),
      tag_clicks: num(raw.tag_clicks),
      content_clicks: num(raw.content_clicks),
      filter_changes: num(raw.filter_changes),
      searches: num(raw.searches)
    };

    const retention = {
      tracking_started: true,
      timezone: 'Asia/Tokyo',
      note: 'Anonymous visitor retention is available only for visits recorded after visitor-id tracking was deployed.',
      current_window: {
        days,
        visitors: num(repeat.visitors),
        repeat_visitors: num(repeat.repeat_visitors),
        repeat_rate: rate(num(repeat.repeat_visitors), num(repeat.visitors)),
        new_visitors: num(repeat.new_visitors),
        returning_visitors: num(repeat.returning_visitors)
      },
      cohorts: cohortRows.map(row => ({
        campaign: row.campaign,
        source: row.source,
        medium: row.medium,
        cohort_start: row.cohort_start,
        visitors: num(row.visitors),
        mature_7d: num(row.mature_7d),
        retained_7d: num(row.retained_7d),
        retention_7d_rate: rate(num(row.retained_7d), num(row.mature_7d)),
        mature_30d: num(row.mature_30d),
        retained_30d: num(row.retained_30d),
        retention_30d_rate: rate(num(row.retained_30d), num(row.mature_30d)),
        habitual_30d: num(row.habitual_30d),
        habitual_30d_rate: rate(num(row.habitual_30d), num(row.mature_30d))
      }))
    };

    return res.status(200).json({
      ok: true,
      days,
      page: page || 'all',
      device: device || 'all',
      summary,
      devices: deviceRows,
      attribution: attributionRows,
      retention,
      games: gameRows
    });
  } catch (error) {
    console.error('[ways-analytics]', error?.message || error);
    return res.status(500).json({ ok: false, error: 'analytics_failed' });
  }
}
