const GAMES_URL = process.env.WAYS_GAMES_SOURCE_URL || 'https://harfway-playback.vercel.app/api/games';
const TIMEOUT_MS = 6500;

const clean = (value, max = 4000) => String(value ?? '').trim().slice(0, max);

function normalizeUrl(value) {
  const raw = clean(value);
  if (!raw) return '';
  try {
    const url = new URL(raw);
    url.hash = '';
    url.search = '';
    return `${url.origin}${url.pathname}`.replace(/\/+$/, '').toLowerCase();
  } catch {
    return raw.replace(/[?#].*$/, '').replace(/\/+$/, '').toLowerCase();
  }
}

function normalizeTitle(value) {
  return clean(value, 500).normalize('NFKC').replace(/\s+/g, ' ').trim().toLowerCase();
}

function steamAppId(storeUrl) {
  const match = clean(storeUrl).match(/store\.steampowered\.com\/app\/(\d+)/i);
  return match ? match[1] : '';
}

function steamHeader(storeUrl) {
  const appId = steamAppId(storeUrl);
  return appId ? `https://cdn.cloudflare.steamstatic.com/steam/apps/${appId}/header.jpg` : '';
}

async function fetchWithTimeout(url, options = {}, timeoutMs = TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal, redirect: 'follow' });
  } finally {
    clearTimeout(timer);
  }
}

async function loadGames() {
  const response = await fetchWithTimeout(GAMES_URL, {
    cache: 'no-store',
    headers: {
      accept: 'application/json',
      'user-agent': 'HARF-WAY-WAYS-ImageResolver/1.0'
    }
  });
  if (!response.ok) throw new Error(`games_${response.status}`);
  const data = await response.json();
  return Array.isArray(data?.entries) ? data.entries : [];
}

function pickGame(entries, { id, storeUrl, title }) {
  const requestedId = clean(id, 500);
  if (requestedId) {
    const item = entries.find(entry => clean(entry?.id, 500) === requestedId);
    if (item) return { item, matchedBy: 'id' };
  }

  const requestedStore = normalizeUrl(storeUrl);
  if (requestedStore) {
    const item = entries.find(entry => normalizeUrl(entry?.storeUrl) === requestedStore);
    if (item) return { item, matchedBy: 'storeUrl' };
  }

  const requestedTitle = normalizeTitle(title);
  if (requestedTitle) {
    const item = entries.find(entry => normalizeTitle(entry?.title) === requestedTitle);
    if (item) return { item, matchedBy: 'title' };
  }

  return null;
}

async function probeImage(url) {
  const target = clean(url);
  if (!target) return { ok: false, reason: 'empty' };
  try {
    const parsed = new URL(target);
    if (parsed.protocol !== 'https:') return { ok: false, reason: 'non_https' };
    const response = await fetchWithTimeout(target, {
      cache: 'no-store',
      headers: {
        accept: 'image/avif,image/webp,image/apng,image/*,*/*;q=0.8',
        range: 'bytes=0-0',
        'user-agent': 'HARF-WAY-WAYS-ImageProbe/1.0'
      }
    }, 5000);
    const type = response.headers.get('content-type') || '';
    const ok = (response.ok || response.status === 206) && /^image\//i.test(type);
    try { await response.body?.cancel?.(); } catch {}
    return { ok, status: response.status, contentType: type, reason: ok ? '' : `http_${response.status}` };
  } catch (error) {
    return { ok: false, reason: error?.name === 'AbortError' ? 'timeout' : 'fetch_failed' };
  }
}

function decodeHtml(value) {
  return clean(value, 4000)
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>');
}

async function articleOgImage(articleUrl) {
  const target = clean(articleUrl);
  if (!target) return '';
  try {
    const parsed = new URL(target);
    if (parsed.protocol !== 'https:' || !/(^|\.)harf-way\.com$/i.test(parsed.hostname)) return '';
    const response = await fetchWithTimeout(target, {
      cache: 'no-store',
      headers: {
        accept: 'text/html,application/xhtml+xml',
        'user-agent': 'HARF-WAY-WAYS-ImageResolver/1.0'
      }
    }, 5000);
    if (!response.ok) return '';
    const html = (await response.text()).slice(0, 300000);
    const patterns = [
      /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i,
      /<meta[^>]+content=["']([^"']+)["'][^>]+property=["']og:image["']/i,
      /<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)["']/i,
      /<meta[^>]+content=["']([^"']+)["'][^>]+name=["']twitter:image["']/i
    ];
    for (const pattern of patterns) {
      const match = html.match(pattern);
      if (match?.[1]) return decodeHtml(match[1]);
    }
  } catch {}
  return '';
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  res.setHeader('Access-Control-Allow-Origin', '*');

  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }

  const id = clean(req.query?.id || req.query?.coreId, 500);
  const storeUrl = clean(req.query?.storeUrl, 4000);
  const title = clean(req.query?.title, 500);
  if (!id && !storeUrl && !title) {
    return res.status(400).json({ ok: false, error: 'lookup_required' });
  }

  try {
    const entries = await loadGames();
    const match = pickGame(entries, { id, storeUrl, title });
    if (!match) return res.status(404).json({ ok: false, error: 'game_not_found' });

    const game = match.item;
    const diagnostics = [];
    const candidates = [];

    const thumbnailUrl = clean(game?.thumbnailUrl, 4000);
    if (thumbnailUrl) candidates.push({ source: 'ways-thumbnail', url: thumbnailUrl });

    const steamUrl = steamHeader(game?.storeUrl || storeUrl);
    if (steamUrl && steamUrl !== thumbnailUrl) candidates.push({ source: 'steam-header', url: steamUrl });

    const ogUrl = await articleOgImage(game?.articleUrl);
    if (ogUrl && !candidates.some(item => item.url === ogUrl)) candidates.push({ source: 'article-og', url: ogUrl });

    for (const candidate of candidates) {
      const probe = await probeImage(candidate.url);
      diagnostics.push({ source: candidate.source, url: candidate.url, ...probe });
      if (!probe.ok) continue;
      return res.status(200).json({
        ok: true,
        image: candidate.url,
        source: candidate.source,
        matchedBy: match.matchedBy,
        fallbackUsed: candidate.source !== 'ways-thumbnail',
        game: {
          id: clean(game?.id, 500),
          title: clean(game?.title, 500),
          storeUrl: clean(game?.storeUrl, 4000),
          articleUrl: clean(game?.articleUrl, 4000)
        },
        diagnostics
      });
    }

    return res.status(404).json({
      ok: false,
      error: 'usable_image_not_found',
      matchedBy: match.matchedBy,
      game: {
        id: clean(game?.id, 500),
        title: clean(game?.title, 500),
        storeUrl: clean(game?.storeUrl, 4000)
      },
      diagnostics
    });
  } catch (error) {
    console.error('[game-image]', error);
    return res.status(502).json({ ok: false, error: 'image_resolver_failed' });
  }
}
