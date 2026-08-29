const PROD = 'https://harfway-playback.vercel.app';
const LEGACY_EVENT = 'https://harfway-ads-delivery.vercel.app/api/event';

const SURFACES = [
  {
    id: 'playback',
    label: 'WAYS',
    pageUrl: `${PROD}/`,
    servePath: '/api/ads-fair-serve',
    placement: 'playback',
    tags: ['WAYS', 'インディーゲーム'],
    eventUrl: LEGACY_EVENT,
  },
  {
    id: 'playlist',
    label: 'PLAYLIST',
    pageUrl: 'https://harfway-playlist-tv.vercel.app/',
    servePath: '/api/ads-fair-serve',
    placement: 'playlist',
    tags: ['PLAYLIST', 'インディーゲーム'],
    eventUrl: LEGACY_EVENT,
  },
  {
    id: 'scraps',
    label: '切れ端',
    pageUrl: `${PROD}/scrapbook/`,
    servePath: '/api/ads-fair-serve',
    placement: 'scraps',
    tags: ['切れ端', 'インディーゲーム'],
    eventUrl: LEGACY_EVENT,
  },
  {
    id: 'sale',
    label: 'SALE WATCH',
    pageUrl: `${PROD}/sales`,
    servePath: '/api/sale-ads-serve',
    placement: 'sale',
    tags: ['SALE WATCH', 'Steam Sale', 'セール'],
    eventUrl: `${PROD}/api/sale-ads-event`,
  },
];

function withTimeout(ms = 7000) {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), ms);
  return { signal: ctrl.signal, done: () => clearTimeout(timer) };
}

async function fetchCheck(url, options = {}, ms = 7000) {
  const t = withTimeout(ms);
  const started = Date.now();
  try {
    const response = await fetch(url, {
      redirect: 'follow',
      cache: 'no-store',
      ...options,
      signal: t.signal,
    });
    return { response, ms: Date.now() - started };
  } finally {
    t.done();
  }
}

async function checkPage(surface) {
  try {
    const { response, ms } = await fetchCheck(surface.pageUrl, {
      headers: { 'User-Agent': 'HARF-WAY-ADS-Health/1.0' },
    });
    return {
      ok: response.ok,
      status: response.status,
      ms,
      detail: response.ok ? 'ページ応答OK' : `HTTP ${response.status}`,
    };
  } catch (error) {
    return { ok: false, status: 0, ms: null, detail: error?.name === 'AbortError' ? 'タイムアウト' : 'ページ取得失敗' };
  }
}

async function checkServe(surface, runId) {
  const url = new URL(surface.servePath, PROD);
  url.searchParams.set('placement', surface.placement);
  url.searchParams.set('tags', surface.tags.join(','));
  url.searchParams.set('sid', `health-${surface.id}-${runId}`);
  try {
    const { response, ms } = await fetchCheck(url, {
      headers: { 'User-Agent': 'HARF-WAY-ADS-Health/1.0' },
    });
    const data = await response.json().catch(() => ({}));
    const ok = response.ok && data?.ok === true && data?.placement === surface.placement;
    return {
      ok,
      status: response.status,
      ms,
      detail: ok ? (data.ad ? `配信候補あり / ${data.ad.title || 'AD'}` : 'API正常 / 現在候補なし') : (data?.error || `HTTP ${response.status}`),
      candidateCount: Number(data?.candidateCount || 0),
      rule: data?.rule || null,
      ad: data?.ad || null,
    };
  } catch (error) {
    return { ok: false, status: 0, ms: null, detail: error?.name === 'AbortError' ? 'タイムアウト' : '配信API取得失敗', candidateCount: 0, rule: null, ad: null };
  }
}

async function checkMedia(ad) {
  if (!ad?.mediaUrl) return { ok: true, status: null, ms: null, detail: '配信候補なし / 素材チェック不要', skipped: true };
  const url = String(ad.mediaUrl);
  try {
    let result = await fetchCheck(url, { method: 'HEAD' }, 7000);
    if (!result.response.ok || result.response.status === 405) {
      result = await fetchCheck(url, { headers: { Range: 'bytes=0-0' } }, 7000);
    }
    const ok = result.response.ok || result.response.status === 206;
    return {
      ok,
      status: result.response.status,
      ms: result.ms,
      detail: ok ? `${ad.mediaMime || 'media'} / 取得OK` : `HTTP ${result.response.status}`,
      mediaUrl: url,
    };
  } catch (error) {
    return { ok: false, status: 0, ms: null, detail: error?.name === 'AbortError' ? 'タイムアウト' : '素材取得失敗', mediaUrl: url };
  }
}

async function checkTracking(surface) {
  try {
    const origin = new URL(surface.pageUrl).origin;
    const { response, ms } = await fetchCheck(surface.eventUrl, {
      method: 'OPTIONS',
      headers: {
        Origin: origin,
        'Access-Control-Request-Method': 'POST',
        'Access-Control-Request-Headers': 'content-type',
      },
    });
    const ok = response.status >= 200 && response.status < 300;
    return {
      ok,
      status: response.status,
      ms,
      detail: ok ? '計測API応答OK / イベント未送信' : `HTTP ${response.status}`,
    };
  } catch (error) {
    return { ok: false, status: 0, ms: null, detail: error?.name === 'AbortError' ? 'タイムアウト' : '計測API確認失敗' };
  }
}

async function inspectSurface(surface, runId) {
  const [page, serve, tracking] = await Promise.all([
    checkPage(surface),
    checkServe(surface, runId),
    checkTracking(surface),
  ]);
  const media = await checkMedia(serve.ad);
  const checks = { page, serve: { ...serve, ad: undefined }, media, tracking };
  const ok = page.ok && serve.ok && media.ok && tracking.ok;
  return {
    id: surface.id,
    label: surface.label,
    pageUrl: surface.pageUrl,
    placement: surface.placement,
    ok,
    checks,
  };
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('X-Robots-Tag', 'noindex');
  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'method_not_allowed' });

  const runId = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  const started = Date.now();
  try {
    const surfaces = await Promise.all(SURFACES.map((surface) => inspectSurface(surface, runId)));
    const healthy = surfaces.filter((surface) => surface.ok).length;
    return res.status(200).json({
      ok: true,
      mode: 'production-readonly',
      countedEvents: 0,
      healthy,
      total: surfaces.length,
      allHealthy: healthy === surfaces.length,
      checkedAt: new Date().toISOString(),
      elapsedMs: Date.now() - started,
      surfaces,
      note: 'This check does not send impression, click, or store_visit events.',
    });
  } catch (error) {
    console.error('[ads-surface-health]', String(error?.message || error));
    return res.status(500).json({ ok: false, error: 'health_check_failed' });
  }
}
