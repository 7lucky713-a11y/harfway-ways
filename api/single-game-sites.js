import { archiveCors } from './archive-core.js';
import { authorizeMutation, databaseContext, getSite, listSites, saveSite, siteSlug } from '../src/lib/single-game-kit/server-v2.js';

function parseBody(req) {
  if (!req.body) return {};
  if (typeof req.body === 'object' && !Buffer.isBuffer(req.body)) return req.body;
  try { return JSON.parse(String(req.body)); } catch { return {}; }
}

export default async function handler(req, res) {
  archiveCors(res);
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('X-Robots-Tag', 'noindex, nofollow');
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PATCH, OPTIONS');
  if (req.method === 'OPTIONS') return res.status(204).end();

  try {
    const context = await databaseContext();
    if (req.method === 'GET') {
      const game = siteSlug(req.query?.game || '');
      if (game) {
        const site = await getSite(context.sql, game);
        if (!site) return res.status(404).json({ ok: false, error: 'site_not_found' });
        return res.status(200).json({ ok: true, site, environment: context.production ? 'production' : (process.env.VERCEL_ENV || 'preview'), storage: context.storage, branchId: context.branchId });
      }
      const sites = await listSites(context.sql);
      return res.status(200).json({ ok: true, sites, environment: context.production ? 'production' : (process.env.VERCEL_ENV || 'preview'), storage: context.storage, branchId: context.branchId });
    }

    await authorizeMutation(req, context.production);
    if (req.method === 'POST' || req.method === 'PATCH') {
      const site = await saveSite(context.sql, parseBody(req));
      return res.status(200).json({ ok: true, site, environment: context.production ? 'production' : (process.env.VERCEL_ENV || 'preview'), storage: context.storage, branchId: context.branchId });
    }
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  } catch (error) {
    console.error('[single-game-sites]', error?.message || error);
    return res.status(error?.status || 500).json({ ok: false, error: error?.message || 'single_game_sites_failed', ...(error?.details || {}) });
  }
}
