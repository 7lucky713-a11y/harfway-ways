import gamesLiveHandler from './games-live.js';

const PROD_ORIGIN = 'https://harfway-playback.vercel.app';

function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);
}

function safeUrl(value = '') {
  try {
    const url = new URL(String(value || ''));
    return ['http:', 'https:'].includes(url.protocol) ? url.toString() : '';
  } catch {
    return '';
  }
}

function requestOrigin(req) {
  if (process.env.VERCEL_ENV === 'production') return PROD_ORIGIN;
  const host = String(req.headers?.['x-forwarded-host'] || req.headers?.host || '').trim();
  const proto = String(req.headers?.['x-forwarded-proto'] || 'https').split(',')[0].trim() || 'https';
  return host ? `${proto}://${host}` : PROD_ORIGIN;
}

async function loadGames() {
  let statusCode = 200;
  let payload = null;
  const res = {
    setHeader() {},
    status(code) { statusCode = code; return this; },
    json(value) { payload = value; return this; },
    end(value) { payload = value; return this; }
  };
  await gamesLiveHandler({ method: 'GET' }, res);
  if (statusCode >= 400 || !payload?.ok || !Array.isArray(payload.entries)) {
    throw new Error(`games_live_${statusCode}`);
  }
  return payload.entries;
}

function notFound(res) {
  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  return res.status(404).end('<!doctype html><meta charset="utf-8"><title>WAYS / NOT FOUND</title>');
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end('Method Not Allowed');
  const id = String(Array.isArray(req.query?.id) ? req.query.id[0] : (req.query?.id || '')).trim();
  if (!id) return notFound(res);

  try {
    const games = await loadGames();
    const game = games.find((entry) => String(entry?.id || '') === id);
    if (!game) return notFound(res);

    const video = safeUrl(game.video);
    if (!video) return notFound(res);
    const image = safeUrl(game.thumbnailUrl);
    const title = String(game.title || 'WAYS');
    const origin = requestOrigin(req);
    const encodedId = encodeURIComponent(id);
    const waysUrl = `${origin}/?game=${encodedId}&utm_source=ways_x_player&utm_medium=player_card&utm_campaign=ways_game_share&utm_content=${encodedId}`;

    const html = `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="theme-color" content="#000000"><title>${escapeHtml(title)} | WAYS</title><style>
:root{color-scheme:dark;--accent:#efff35}*{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;overflow:hidden;background:#000;font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans JP",sans-serif}.x-player{position:relative;width:100vw;height:100vh;overflow:hidden;background:#000}.x-player video{display:block;width:100%;height:100%;object-fit:contain;background:#000}.end-card{position:absolute;z-index:5;inset:0;display:flex;align-items:center;justify-content:center;padding:24px;background:radial-gradient(circle at center,#0004 0,#0009 72%,#000b 100%);opacity:0;pointer-events:none;transition:opacity .2s ease}.x-player.is-ended .end-card{opacity:1;pointer-events:auto}.end-card a{display:inline-flex;align-items:center;justify-content:center;gap:10px;min-width:min(280px,74vw);padding:16px 22px;border:1px solid var(--accent);border-radius:999px;background:#0b0c0edc;color:#fff;text-decoration:none;font-size:clamp(14px,2.2vw,22px);font-weight:950;letter-spacing:.01em;box-shadow:0 12px 40px #000a;backdrop-filter:blur(10px);transform:translateY(8px) scale(.98);transition:transform .2s ease,background .16s ease,color .16s ease}.x-player.is-ended .end-card a{transform:translateY(0) scale(1)}.end-card a b{color:var(--accent)}.end-card a:hover,.end-card a:focus-visible{background:var(--accent);color:#111}.end-card a:hover b,.end-card a:focus-visible b{color:#111}@media(max-width:520px){.end-card{padding:18px}.end-card a{min-width:min(240px,78vw);padding:14px 18px}}
</style></head><body><main class="x-player" id="waysXPlayer"><video controls playsinline preload="metadata" ${image ? `poster="${escapeHtml(image)}"` : ''} src="${escapeHtml(video)}" onended="this.parentElement.classList.add('is-ended')" onplay="this.parentElement.classList.remove('is-ended')"></video><div class="end-card" aria-hidden="false"><a target="_blank" rel="noopener" href="${escapeHtml(waysUrl)}" aria-label="WAYSでこの作品を見る"><span>WAYSで見る</span><b>↗</b></a></div></main></body></html>`;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=3600');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('Content-Security-Policy', "default-src 'none'; img-src https: data:; media-src https:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; frame-ancestors *; base-uri 'none'; form-action 'none'");
    return res.status(200).end(html);
  } catch (error) {
    console.error('[ways-x-player]', error?.message || error);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    return res.status(503).end('<!doctype html><meta charset="utf-8"><title>WAYS / TEMPORARILY UNAVAILABLE</title>');
  }
}
