const TTL_MS = 6 * 60 * 60 * 1000;
const cache = globalThis.__harfwayArticleSteamCache || new Map();
globalThis.__harfwayArticleSteamCache = cache;

function allowedArticleUrl(value) {
  try {
    const u = new URL(String(value || ''));
    return u.protocol === 'https:' && /(^|\.)harf-way\.com$/i.test(u.hostname) ? u.toString() : '';
  } catch { return ''; }
}

function extractSteam(html) {
  const raw = String(html || '').replace(/&amp;/gi, '&').replace(/\\\//g, '/');
  const m = raw.match(/https?:\/\/store\.steampowered\.com\/app\/(\d+)(?:\/[^\s"'<>)]*)?/i);
  if (!m) return { appid: null, steamUrl: '' };
  return { appid: m[1], steamUrl: `https://store.steampowered.com/app/${m[1]}/` };
}

async function resolveOne(url) {
  const hit = cache.get(url);
  if (hit && Date.now() - hit.at < TTL_MS) return { ...hit.value, cached: true };

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 5000);
  let value;
  try {
    const response = await fetch(url, {
      headers: { accept: 'text/html,application/xhtml+xml', 'user-agent': 'Mozilla/5.0 HARF-WAY-Sale-Watch/2.0' },
      redirect: 'follow',
      signal: controller.signal,
      cache: 'no-store'
    });
    if (!response.ok) throw new Error(`article_http_${response.status}`);
    value = { url, ok: true, ...extractSteam(await response.text()) };
  } catch (error) {
    value = { url, ok: false, appid: null, steamUrl: '', error: error?.name === 'AbortError' ? 'article_timeout' : (error?.message || 'article_fetch_failed') };
  } finally {
    clearTimeout(timeout);
  }
  cache.set(url, { at: Date.now(), value });
  return { ...value, cached: false };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('X-Robots-Tag', 'noindex');
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'method_not_allowed' });

  const input = Array.isArray(req.query?.u) ? req.query.u : [req.query?.u];
  const urls = [...new Set(input.map(allowedArticleUrl).filter(Boolean))].slice(0, 4);
  if (!urls.length) {
    res.setHeader('Cache-Control', 'public, s-maxage=300');
    return res.status(200).json({ ok: true, rows: [] });
  }

  const rows = await Promise.all(urls.map(resolveOne));
  res.setHeader('Cache-Control', 'public, s-maxage=21600, stale-while-revalidate=86400');
  return res.status(200).json({ ok: true, rows });
}
