import { listPublicNotes, publicDatabaseContext } from '../lib/game-public-seo.js';

const MAX_ITEMS = 3;

function publicCard(note) {
  const excerpt = String(note.excerpt || note.body || '').replace(/\s+/g, ' ').trim();
  return {
    id: note.id,
    title: note.seoTitle || note.title || 'プレイノート',
    gameName: note.gameName || '',
    typeName: note.typeName || '',
    excerpt: excerpt.slice(0, 260),
    publishedAt: note.publishedAt || note.sourceCreatedAt || null,
    url: note.url
  };
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'GET, OPTIONS');
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Robots-Tag', 'noindex');

  if (req.method === 'OPTIONS') return res.status(204).end();
  if (req.method !== 'GET') {
    res.setHeader('Allow', 'GET, OPTIONS');
    return res.status(405).json({ ok: false, error: 'method_not_allowed' });
  }

  try {
    // Same active public snapshots as /notes/: Game Notes and explicitly published CLIPS.
    // Private drafts and archived source records are filtered by listPublicNotes.
    const { sql } = await publicDatabaseContext();
    const notes = await listPublicNotes(sql);
    const entries = notes.slice(0, MAX_ITEMS).map(publicCard);
    // Browser requests may recheck normally, but Vercel should reuse the public
    // snapshot for 24h instead of waking Neon after each short-lived TTL.
    res.setHeader('Cache-Control', 'public, max-age=0, must-revalidate');
    res.setHeader('Vercel-CDN-Cache-Control', 'public, s-maxage=86400');
    return res.status(200).json({ ok: true, entries, count: entries.length });
  } catch (error) {
    console.error('[public-notes-latest]', error?.message || error);
    res.setHeader('Cache-Control', 'no-store');
    return res.status(503).json({ ok: false, error: 'public_notes_unavailable' });
  }
}
