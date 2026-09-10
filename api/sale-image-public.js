import {
  readSnapshot,
  snapshotSaleItems,
} from './_sales-snapshot-store.js';

const PREVIEW_IMAGES = {
  '266210': 'https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/266210/header_japanese.jpg?t=1728470787',
  '1249480': 'https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/1249480/header.jpg?t=1781861267',
  '3124230': 'https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/3124230/b3027a9f771775436667270d7f66f413b507a6a8/header_alt_assets_0.jpg?t=1788498541',
  '1181610': 'https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/1181610/header.jpg?t=1748596332',
  '1662480': 'https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/1662480/header.jpg?t=1726826799',
  '2132850': 'https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/2132850/header.jpg?t=1771398437',
};

function safeAppid(value) {
  const appid = String(value || '').trim();
  return /^\d{1,12}$/.test(appid) ? appid : '';
}

function isAllowedSteamImage(url) {
  try {
    const parsed = new URL(url);
    return (
      parsed.protocol === 'https:' &&
      (parsed.hostname === 'steamstatic.com' || parsed.hostname.endsWith('.steamstatic.com'))
    );
  } catch {
    return false;
  }
}

function imageCandidates(sourceUrl, appid) {
  const candidates = [];
  const add = (value) => {
    if (value && isAllowedSteamImage(value) && !candidates.includes(value)) {
      candidates.push(value);
    }
  };

  add(sourceUrl);

  for (const host of [
    'shared.akamai.steamstatic.com',
    'shared.fastly.steamstatic.com',
    'shared.cloudflare.steamstatic.com',
  ]) {
    try {
      const parsed = new URL(sourceUrl);
      parsed.hostname = host;
      add(parsed.toString());
    } catch {
      // ignore malformed source url
    }
  }

  add(`https://cdn.akamai.steamstatic.com/steam/apps/${appid}/header.jpg`);
  return candidates;
}

async function resolveSnapshotImage(appid) {
  try {
    const snapshot = await readSnapshot();
    const item = snapshotSaleItems(snapshot).find((entry) => String(entry?.appid || '') === appid);
    if (item?.image) return item.image;
  } catch (error) {
    console.warn('[sale-image-public] snapshot lookup failed:', error?.message || error);
  }

  if (process.env.VERCEL_ENV !== 'production') {
    return PREVIEW_IMAGES[appid] || '';
  }

  return '';
}

async function fetchImage(candidates) {
  for (const url of candidates) {
    try {
      const response = await fetch(url, {
        redirect: 'follow',
        headers: {
          Accept: 'image/avif,image/webp,image/apng,image/svg+xml,image/*,*/*;q=0.8',
          Referer: 'https://store.steampowered.com/',
          'User-Agent': 'Mozilla/5.0 (compatible; HARF-WAY-SaleWatch/1.0; +https://harf-way.com/)',
        },
      });

      if (!response.ok) continue;

      const contentType = response.headers.get('content-type') || '';
      if (!contentType.startsWith('image/')) continue;

      return {
        body: Buffer.from(await response.arrayBuffer()),
        contentType,
        sourceUrl: url,
      };
    } catch (error) {
      console.warn('[sale-image-public] upstream fetch failed:', url, error?.message || error);
    }
  }

  return null;
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('X-Robots-Tag', 'noindex');

  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    return res.status(204).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }

  const appid = safeAppid(req.query?.appid);
  if (!appid) {
    return res.status(400).json({ ok: false, error: 'invalid_appid' });
  }

  const sourceUrl = await resolveSnapshotImage(appid);
  if (!sourceUrl || !isAllowedSteamImage(sourceUrl)) {
    return res.status(404).json({ ok: false, error: 'sale_image_not_found' });
  }

  const result = await fetchImage(imageCandidates(sourceUrl, appid));
  if (!result) {
    return res.status(502).json({ ok: false, error: 'steam_image_unavailable' });
  }

  res.setHeader('Content-Type', result.contentType);
  res.setHeader('Cache-Control', 'public, max-age=3600, s-maxage=86400, stale-while-revalidate=604800');
  res.setHeader('X-HARFWAY-Image-Source', new URL(result.sourceUrl).hostname);
  return res.status(200).send(result.body);
}
