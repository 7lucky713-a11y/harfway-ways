import { getSql } from './ads-fair-core.js';

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store, max-age=0');
  res.setHeader('X-Robots-Tag', 'noindex');
  if (req.method !== 'GET') return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  if (process.env.VERCEL_ENV !== 'preview') return res.status(404).json({ ok: false, error: 'not_found' });

  try {
    const sql = getSql();
    const constraints = await sql`
      SELECT conname, pg_get_constraintdef(oid, true) AS definition
      FROM pg_constraint
      WHERE conrelid = 'public.ad_campaigns'::regclass
        AND contype = 'c'
      ORDER BY conname
    `;
    const statuses = await sql`
      SELECT status, count(*)::int AS count
      FROM public.ad_campaigns
      GROUP BY status
      ORDER BY status
    `;
    return res.status(200).json({ ok: true, constraints, statuses });
  } catch (error) {
    return res.status(500).json({ ok: false, error: error instanceof Error ? error.message : String(error) });
  }
}
