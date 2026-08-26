import { neon } from '@neondatabase/serverless';
import trackHandler from '../api/track.js';
import analyticsHandler from '../api/analytics.js';

const url = process.env.DATABASE_URL;
if (!url) throw new Error('DATABASE_URL is missing');
const sql = neon(url);
const sid = `ways-prod-preview-smoke-${Date.now()}`;

function responseMock() {
  return {
    statusCode: 200,
    payload: null,
    setHeader() {},
    status(code) { this.statusCode = code; return this; },
    json(value) { this.payload = value; return this; },
    end() { return this; }
  };
}

async function callTrack(event, extra = {}) {
  const req = {
    method: 'POST',
    body: {
      event,
      sessionId: sid,
      page: 'ways-smoke',
      device: 'desktop',
      source: 'prod-preview-smoke',
      ...extra
    }
  };
  const res = responseMock();
  await trackHandler(req, res);
  if (res.statusCode !== 200 || !res.payload?.ok) {
    throw new Error(`track handler failed: ${res.statusCode} ${JSON.stringify(res.payload)}`);
  }
}

try {
  await callTrack('page_view');
  await callTrack('view', { gameId: 'prod-preview-smoke-game' });
  await callTrack('play', { gameId: 'prod-preview-smoke-game', duration: 20 });
  await callTrack('view_end', { gameId: 'prod-preview-smoke-game', progress: 42.5, duration: 20 });

  const req = { method: 'GET', query: { days: '1', device: 'desktop' } };
  const res = responseMock();
  await analyticsHandler(req, res);
  if (res.statusCode !== 200 || !res.payload?.ok) {
    throw new Error(`analytics handler failed: ${res.statusCode} ${JSON.stringify(res.payload)}`);
  }
  const row = res.payload.games?.find(x => x.game_id === 'prod-preview-smoke-game');
  if (!row || Number(row.views) < 1 || Number(row.plays) < 1) {
    throw new Error(`analytics smoke row missing: ${JSON.stringify(row)}`);
  }
  console.log('[analytics-api-smoke]', {
    ok: true,
    tracked: 4,
    game_views: row.views,
    plays: row.plays,
    avg_watch_pct: row.avg_watch_pct
  });
} finally {
  await sql`DELETE FROM public.ways_analytics_events WHERE session_id = ${sid}`;
  const left = await sql`SELECT count(*)::int AS count FROM public.ways_analytics_events WHERE session_id = ${sid}`;
  console.log('[analytics-api-smoke-cleanup]', { remaining: left?.[0]?.count ?? null });
}
