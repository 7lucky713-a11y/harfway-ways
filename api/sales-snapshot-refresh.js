import { getSteamPrices } from './_steam-sale-core.js';
import {
  emptySnapshot,
  readSnapshot,
  writeSnapshot,
  snapshotSaleItems,
} from './_sales-snapshot-store.js';

export const config = { maxDuration: 300 };

const PROD_BASE = process.env.SALE_WATCH_CATALOG_BASE || 'https://harfway-playback.vercel.app';
const CATALOG_URL = `${PROD_BASE}/api/sales-catalog`;
const MAX_DAILY_CATALOG_SIZE = 600;
const CATALOG_TIMEOUT_MS = 15000;

function productionCronAuthorized(req) {
  if (process.env.VERCEL_ENV !== 'production') return true;
  const secret = String(process.env.CRON_SECRET || '');
  if (!secret) return false;
  return String(req.headers?.authorization || '') === `Bearer ${secret}`;
}

function stableHash(value) {
  let hash = 2166136261;
  const text = String(value || '');
  for (let i = 0; i < text.length; i += 1) {
    hash ^= text.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

async function fetchCatalog() {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), CATALOG_TIMEOUT_MS);
  try {
    const response = await fetch(CATALOG_URL, {
      headers: { accept: 'application/json', 'user-agent': 'HARF-WAY-Sale-Snapshot/1.0' },
      signal: controller.signal,
      cache: 'no-store',
    });
    if (!response.ok) throw new Error(`catalog_http_${response.status}`);
    const data = await response.json();
    if (!data?.ok || !Array.isArray(data.rows)) throw new Error('catalog_invalid');
    return data;
  } finally {
    clearTimeout(timer);
  }
}

function uniqueSteamRows(rows) {
  const map = new Map();
  for (const row of rows || []) {
    const appid = String(row?.appid || '').trim();
    if (!/^\d+$/.test(appid)) continue;
    if (!map.has(appid)) map.set(appid, row);
  }
  return [...map.values()].sort((a, b) => stableHash(a.appid) - stableHash(b.appid));
}

function reconcileStates(states, catalogRows) {
  const allowed = new Set(catalogRows.map((row) => String(row.appid)));
  const next = {};
  for (const [appid, value] of Object.entries(states || {})) {
    if (allowed.has(appid)) next[appid] = value;
  }
  return next;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex');

  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  if (!productionCronAuthorized(req)) return res.status(401).json({ ok: false, error: 'unauthorized_cron' });

  const startedAt = Date.now();
  const dryRun = process.env.VERCEL_ENV !== 'production';

  try {
    const [catalog, existing] = await Promise.all([
      fetchCatalog(),
      readSnapshot().catch(() => null),
    ]);

    const catalogRows = uniqueSteamRows(catalog.rows);
    if (!catalogRows.length) throw new Error('catalog_has_no_steam_rows');

    const snapshot = existing || emptySnapshot();
    snapshot.states = reconcileStates(snapshot.states, catalogRows);

    if (catalogRows.length > MAX_DAILY_CATALOG_SIZE) {
      throw new Error('daily_catalog_exceeds_safe_limit');
    }
    const isBootstrap = !existing || Object.keys(snapshot.states).length < 3;
    // A daily job must refresh the full catalog, not the old 32-game rotating slice.
    const selectedRows = catalogRows;
    const selectedIds = selectedRows.map((row) => String(row.appid));
    const rowByAppid = new Map(selectedRows.map((row) => [String(row.appid), row]));

    const priceResult = await getSteamPrices(selectedIds, true);
    const checkedAt = new Date().toISOString();
    let successfulChecks = 0;
    let failedChecks = 0;

    for (const appid of selectedIds) {
      const row = rowByAppid.get(appid) || {};
      const price = priceResult instanceof Map
        ? priceResult.get(appid)
        : priceResult?.prices?.[appid];
      if (!price?.ok) {
        failedChecks += 1;
        continue;
      }

      successfulChecks += 1;
      snapshot.states[appid] = {
        appid,
        title: price.steamName || row.title || `Steam ${appid}`,
        image: price.headerImage || row.thumbnail || '',
        initial: price.initialFormatted || '',
        final: price.finalFormatted || '',
        discount: Number(price.discountPercent || 0),
        store: row.steamUrl || row.storeUrl || `https://store.steampowered.com/app/${appid}/`,
        onSale: Boolean(price.onSale),
        checkedAt,
      };
    }

    snapshot.cursor = 0;
    snapshot.cycle = Number(snapshot.cycle || 0) + 1;
    snapshot.generatedAt = checkedAt;
    snapshot.catalogUpdatedAt = catalog.updatedAt || null;

    const saleItems = snapshotSaleItems(snapshot);
    const metadata = {
      catalogCount: catalogRows.length,
      checkedThisRun: selectedRows.length,
      successfulChecks,
      failedChecks,
      knownStates: Object.keys(snapshot.states).length,
      saleCount: saleItems.length,
      cursor: snapshot.cursor,
      cycle: snapshot.cycle,
      bootstrap: isBootstrap,
      durationMs: Date.now() - startedAt,
    };

    if (!dryRun) await writeSnapshot(snapshot, metadata);

    return res.status(200).json({
      ok: true,
      dryRun,
      source: 'sales-catalog + steam-appdetails',
      updatedAt: checkedAt,
      metadata,
      sample: saleItems.slice(0, 12),
    });
  } catch (error) {
    console.error('[sales-snapshot-refresh]', error?.message || error);
    return res.status(503).json({
      ok: false,
      dryRun,
      error: String(error?.message || 'sale_snapshot_refresh_failed'),
      durationMs: Date.now() - startedAt,
    });
  }
}
