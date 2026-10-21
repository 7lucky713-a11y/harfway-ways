const SUCCESS_CACHE = 'public, max-age=1800, s-maxage=21600, stale-while-revalidate=86400';
const FALLBACK_CACHE = 'public, max-age=60, s-maxage=300';

function validAppId(value) {
  const appId = String(Array.isArray(value) ? value[0] : value ?? '').trim();
  return /^[1-9]\d{0,9}$/.test(appId) ? appId : '';
}

function safeSteamImageUrl(value, appId) {
  try {
    const url = new URL(String(value || ''));
    return url.protocol === 'https:'
      && (url.hostname === 'steamstatic.com' || url.hostname.endsWith('.steamstatic.com'))
      && url.pathname.includes(`/steam/apps/${appId}/`)
      && /\.(?:jpe?g|png|webp)$/i.test(url.pathname)
      ? url.href : '';
  } catch {
    return '';
  }
}

export async function resolveSteamHeaderImage(appId, fetchImpl = fetch) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 4000);
  try {
    const params = new URLSearchParams({ appids: appId, l: 'japanese' });
    const response = await fetchImpl(`https://store.steampowered.com/api/appdetails?${params}`, {
      headers: { accept: 'application/json', 'user-agent': 'Mozilla/5.0 HARF-WAY-Play-Notes/1.0' },
      signal: controller.signal,
    });
    if (!response.ok) return '';
    const app = (await response.json())?.[appId];
    if (!app?.success) return '';
    for (const candidate of [app.data?.header_image, app.data?.capsule_image]) {
      const image = safeSteamImageUrl(candidate, appId);
      if (image) return image;
    }
  } catch (error) {
    console.warn('[play-note-steam-art] Steam lookup failed:', error?.message || error);
  } finally {
    clearTimeout(timeout);
  }
  return '';
}

export default async function handler(req, res) {
  res.setHeader('X-Robots-Tag', 'noindex');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'method_not_allowed' });

  const appId = validAppId(req.query?.appid);
  if (!appId) return res.status(400).json({ ok: false, error: 'invalid_appid' });

  const image = await resolveSteamHeaderImage(appId);
  const fallback = `https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/${appId}/header.jpg`;
  res.setHeader('Location', image || fallback);
  res.setHeader('Cache-Control', image ? SUCCESS_CACHE : FALLBACK_CACHE);
  return res.status(302).end();
}
