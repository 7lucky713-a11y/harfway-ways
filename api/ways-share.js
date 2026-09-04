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
  return res.status(404).end('<!doctype html><meta charset="utf-8"><title>WAYS / NOT FOUND</title><body style="background:#090909;color:#fff;font-family:system-ui;padding:40px">WAYSの作品が見つかりませんでした。</body>');
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end('Method Not Allowed');

  const id = String(Array.isArray(req.query?.id) ? req.query.id[0] : (req.query?.id || '')).trim();
  const mode = String(Array.isArray(req.query?.mode) ? req.query.mode[0] : (req.query?.mode || 'share')) === 'embed' ? 'embed' : 'share';
  if (!id) return notFound(res);

  try {
    const games = await loadGames();
    const game = games.find((entry) => String(entry?.id || '') === id);
    if (!game) return notFound(res);

    const runtimeOrigin = requestOrigin(req);
    const isPreview = process.env.VERCEL_ENV !== 'production';
    const encodedId = encodeURIComponent(id);
    const runtimeShareUrl = `${runtimeOrigin}/share/${encodedId}`;
    const runtimeEmbedUrl = `${runtimeOrigin}/embed/${encodedId}`;
    const publicShareUrl = `${PROD_ORIGIN}/share/${encodedId}`;
    const waysUrl = `${runtimeOrigin}/?game=${encodedId}&utm_source=ways_share&utm_medium=share_link&utm_campaign=ways_game_share&utm_content=${encodedId}`;
    const title = String(game.title || 'WAYS');
    const description = String(game.description || '').trim() || `20秒でゲームを掘る。HARF-WAY / WAYSで「${title}」を見る。`;
    const image = safeUrl(game.thumbnailUrl);
    const video = safeUrl(game.video);
    const store = safeUrl(game.storeUrl);
    const width = Math.max(1, Number(game.videoWidth) || 1280);
    const height = Math.max(1, Number(game.videoHeight) || 720);
    const pageTitle = `${title} | WAYS`;

    const meta = `
<meta property="og:type" content="video.other">
<meta property="og:site_name" content="HARF-WAY / WAYS">
<meta property="og:title" content="${escapeHtml(pageTitle)}">
<meta property="og:description" content="${escapeHtml(description)}">
<meta property="og:url" content="${escapeHtml(publicShareUrl)}">
${image ? `<meta property="og:image" content="${escapeHtml(image)}"><meta property="og:image:secure_url" content="${escapeHtml(image)}"><meta property="og:image:width" content="${width}"><meta property="og:image:height" content="${height}">` : ''}
${video ? `<meta property="og:video" content="${escapeHtml(video)}"><meta property="og:video:secure_url" content="${escapeHtml(video)}"><meta property="og:video:type" content="video/mp4"><meta property="og:video:width" content="${width}"><meta property="og:video:height" content="${height}">` : ''}
<meta name="twitter:card" content="summary_large_image">
<meta name="twitter:title" content="${escapeHtml(pageTitle)}">
<meta name="twitter:description" content="${escapeHtml(description)}">
${image ? `<meta name="twitter:image" content="${escapeHtml(image)}"><meta name="twitter:image:alt" content="${escapeHtml(title)}">` : ''}
<link rel="canonical" href="${escapeHtml(publicShareUrl)}">`;

    const commonCss = `
:root{color-scheme:dark;--bg:#090909;--panel:#111214;--line:#292b30;--text:#f5f5ef;--muted:#999da5;--accent:#efff35}
*{box-sizing:border-box}html,body{margin:0;background:var(--bg);color:var(--text);font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans JP",sans-serif}a{color:inherit}.frame{position:relative;background:#000;overflow:hidden}.frame video{width:100%;height:100%;display:block;object-fit:contain;background:#000}.brand{font-size:10px;letter-spacing:.15em;color:var(--accent);font-weight:900}.title{font-weight:950;letter-spacing:-.035em}.muted{color:var(--muted)}.cta{display:inline-flex;align-items:center;justify-content:center;text-decoration:none;background:var(--accent);color:#111;font-weight:950;border-radius:999px}.preview-note{padding:9px 12px;background:#171912;border:1px solid #39400e;color:#d9e62f;font-size:10px;line-height:1.55}`;

    const previewNote = isPreview
      ? '<div class="preview-note">PREVIEW / Vercel保護中のため、X・Discordなど外部クローラーからのカード取得は本番公開後にのみ確認できます。ここでは共有ページと埋め込みプレイヤー本体を確認できます。</div>'
      : '';

    const embedBody = `
<main class="embed-shell">
  ${previewNote}
  <div class="frame"><video controls playsinline preload="metadata" ${image ? `poster="${escapeHtml(image)}"` : ''} src="${escapeHtml(video)}"></video></div>
  <div class="embed-bar"><div><div class="brand">HARF-WAY / WAYS</div><div class="title">${escapeHtml(title)}</div></div><a class="cta" target="_blank" rel="noopener" href="${escapeHtml(waysUrl)}">WAYSで見る ↗</a></div>
</main>`;

    const shareBody = `
<main class="share-shell">
  ${previewNote}
  <a class="back" href="${escapeHtml(waysUrl)}">← WAYS</a>
  <section class="card">
    <div class="frame share-frame"><video controls playsinline preload="metadata" ${image ? `poster="${escapeHtml(image)}"` : ''} src="${escapeHtml(video)}"></video></div>
    <div class="copy"><div class="brand">HARF-WAY / WAYS</div><h1>${escapeHtml(title)}</h1><p>${escapeHtml(description)}</p><div class="actions"><a class="cta" href="${escapeHtml(waysUrl)}">WAYSで続きを見る</a>${store ? `<a class="sub" target="_blank" rel="noopener" href="${escapeHtml(store)}">STORE ↗</a>` : ''}</div></div>
  </section>
</main>`;

    const modeCss = mode === 'embed'
      ? `.embed-shell{width:100vw;height:100vh;display:grid;grid-template-rows:auto minmax(0,1fr) auto;background:#080808}.embed-shell .frame{min-height:0}.embed-shell .frame video{height:100%}.embed-bar{display:flex;gap:16px;align-items:center;justify-content:space-between;padding:12px 14px;border-top:1px solid var(--line);background:#0d0e10}.embed-bar .title{font-size:14px;margin-top:3px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;max-width:62vw}.embed-bar .cta{padding:9px 12px;font-size:10px;white-space:nowrap}@media(max-width:520px){.embed-bar{padding:9px 10px}.embed-bar .brand{font-size:8px}.embed-bar .title{font-size:12px}.embed-bar .cta{padding:8px 10px;font-size:9px}}`
      : `.share-shell{min-height:100vh;max-width:1100px;margin:0 auto;padding:32px 20px 64px}.share-shell>.preview-note{margin-bottom:16px}.back{display:inline-block;color:#b9bdc5;text-decoration:none;font-size:11px;margin-bottom:18px}.card{display:grid;grid-template-columns:minmax(0,1.55fr) minmax(280px,.65fr);background:var(--panel);border:1px solid var(--line);min-height:480px}.share-frame{display:grid;place-items:center}.share-frame video{max-height:76vh}.copy{padding:30px;display:flex;flex-direction:column;justify-content:center}.copy h1{font-size:clamp(32px,4vw,62px);line-height:.95;margin:12px 0 16px}.copy p{font-size:13px;line-height:1.8;color:#c8cbd0}.actions{display:flex;gap:8px;flex-wrap:wrap;margin-top:18px}.actions .cta,.actions .sub{padding:11px 14px;font-size:10px}.actions .sub{border:1px solid #444850;text-decoration:none}@media(max-width:780px){.share-shell{padding:16px 12px 40px}.card{grid-template-columns:1fr;min-height:0}.share-frame{aspect-ratio:16/9}.share-frame video{height:100%}.copy{padding:20px}.copy h1{font-size:36px}}`;

    const html = `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="theme-color" content="#090909"><title>${escapeHtml(pageTitle)}</title>${meta}<style>${commonCss}${modeCss}</style></head><body>${mode === 'embed' ? embedBody : shareBody}</body></html>`;

    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=3600');
    res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
    res.setHeader('X-Ways-Share-Url', runtimeShareUrl);
    res.setHeader('X-Ways-Embed-Url', runtimeEmbedUrl);
    if (mode === 'embed') {
      res.setHeader('Content-Security-Policy', "default-src 'none'; img-src https: data:; media-src https:; style-src 'unsafe-inline'; frame-ancestors *; base-uri 'none'; form-action 'none'");
    }
    return res.status(200).end(html);
  } catch (error) {
    console.error('[ways-share]', error?.message || error);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    return res.status(503).end('<!doctype html><meta charset="utf-8"><title>WAYS / TEMPORARILY UNAVAILABLE</title><body style="background:#090909;color:#fff;font-family:system-ui;padding:40px">共有ページを読み込めませんでした。</body>');
  }
}
