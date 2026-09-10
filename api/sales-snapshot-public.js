import {
  readSnapshot,
  snapshotSaleItems,
  SALES_PUBLIC_MAX_AGE_HOURS,
} from './_sales-snapshot-store.js';

const PREVIEW_ITEMS = [
  {
    appid: '266210', title: '片道勇者',
    image: 'https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/266210/header_japanese.jpg?t=1728470787',
    initial: '¥ 350', final: '¥ 108', discount: 69,
    store: 'https://store.steampowered.com/app/266210/', onSale: true,
  },
  {
    appid: '1249480', title: 'Ex-Zodiac',
    image: 'https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/1249480/header.jpg?t=1781861267',
    initial: '¥ 1,200', final: '¥ 540', discount: 55,
    store: 'https://store.steampowered.com/app/1249480/', onSale: true,
  },
  {
    appid: '3124230', title: 'Jackal',
    image: 'https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/3124230/b3027a9f771775436667270d7f66f413b507a6a8/header_alt_assets_0.jpg?t=1788498541',
    initial: '¥ 1,700', final: '¥ 1,020', discount: 40,
    store: 'https://store.steampowered.com/app/3124230/', onSale: true,
  },
  {
    appid: '1181610', title: 'Roto Force',
    image: 'https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/1181610/header.jpg?t=1748596332',
    initial: '¥ 920', final: '¥ 322', discount: 65,
    store: 'https://store.steampowered.com/app/1181610/', onSale: true,
  },
  {
    appid: '1662480', title: 'Nuclear Blaze',
    image: 'https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/1662480/header.jpg?t=1726826799',
    initial: '¥ 1,200', final: '¥ 300', discount: 75,
    store: 'https://store.steampowered.com/app/1662480/', onSale: true,
  },
  {
    appid: '2132850', title: 'Rabbit and Steel',
    image: 'https://shared.akamai.steamstatic.com/store_item_assets/steam/apps/2132850/header.jpg?t=1771398437',
    initial: '¥ 1,700', final: '¥ 850', discount: 50,
    store: 'https://store.steampowered.com/app/2132850/', onSale: true,
  },
];

function previewFixture() {
  const checkedAt = new Date().toISOString();
  return PREVIEW_ITEMS.map((item) => ({ ...item, checkedAt }));
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=900');
  res.setHeader('X-Robots-Tag', 'noindex');

  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
    return res.status(204).end();
  }
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'method_not_allowed' });

  try {
    const snapshot = await readSnapshot();
    const items = snapshot ? snapshotSaleItems(snapshot) : [];

    if (items.length) {
      return res.status(200).json({
        ok: true,
        source: 'sale-watch-snapshot',
        updatedAt: snapshot.generatedAt || snapshot.updatedAt || null,
        maxAgeHours: SALES_PUBLIC_MAX_AGE_HOURS,
        count: items.length,
        items,
      });
    }

    if (process.env.VERCEL_ENV !== 'production') {
      const fixture = previewFixture();
      return res.status(200).json({
        ok: true,
        source: 'preview-fixture',
        preview: true,
        updatedAt: new Date().toISOString(),
        maxAgeHours: SALES_PUBLIC_MAX_AGE_HOURS,
        count: fixture.length,
        items: fixture,
      });
    }

    return res.status(503).json({
      ok: false,
      ready: false,
      error: 'sale_snapshot_not_ready',
      items: [],
    });
  } catch (error) {
    console.error('[sales-snapshot-public]', error?.message || error);
    if (process.env.VERCEL_ENV !== 'production') {
      const fixture = previewFixture();
      return res.status(200).json({
        ok: true,
        source: 'preview-fixture-after-read-error',
        preview: true,
        updatedAt: new Date().toISOString(),
        maxAgeHours: SALES_PUBLIC_MAX_AGE_HOURS,
        count: fixture.length,
        items: fixture,
      });
    }
    return res.status(503).json({ ok: false, error: 'sale_snapshot_unavailable', items: [] });
  }
}
