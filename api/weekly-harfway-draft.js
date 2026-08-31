const JST_MS = 9 * 60 * 60 * 1000;
const DAY_MS = 24 * 60 * 60 * 1000;

function send(res, status, body) {
  res.status(status);
  res.setHeader('Cache-Control', 'no-store');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.json(body);
}

function stripHtml(value = '') {
  return String(value)
    .replace(/<style[\s\S]*?<\/style>/gi, ' ')
    .replace(/<script[\s\S]*?<\/script>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/&#039;|&apos;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/\s+/g, ' ')
    .trim();
}

function mondayRange(now = new Date()) {
  const shifted = new Date(now.getTime() + JST_MS);
  const y = shifted.getUTCFullYear();
  const m = shifted.getUTCMonth();
  const d = shifted.getUTCDate();
  const weekday = shifted.getUTCDay();
  const daysSinceMonday = (weekday + 6) % 7;
  const mondayLocalAsUtc = Date.UTC(y, m, d - daysSinceMonday, 0, 0, 0);
  const end = new Date(mondayLocalAsUtc - JST_MS);
  const start = new Date(end.getTime() - 7 * DAY_MS);
  return { start, end };
}

function fmt(date) {
  return new Intl.DateTimeFormat('ja-JP', {
    timeZone: 'Asia/Tokyo',
    month: '2-digit',
    day: '2-digit'
  }).format(date);
}

async function fetchJson(url, timeoutMs = 10000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const response = await fetch(url, {
      cache: 'no-store',
      headers: { accept: 'application/json' },
      signal: controller.signal
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(`${response.status}:${url}`);
    return data;
  } finally {
    clearTimeout(timer);
  }
}

function classifyPost(post) {
  const title = stripHtml(post?.title?.rendered || '');
  const link = String(post?.link || '');
  const terms = (post?._embedded?.['wp:term'] || [])
    .flat()
    .flatMap(term => [term?.name, term?.slug])
    .filter(Boolean)
    .join(' ');
  const hay = `${title} ${link} ${terms}`.toLowerCase();
  if (/digames_playlist|プレイリスト|playlist/.test(hay)) return 'PLAYLIST';
  if (/切れ端|scrap|kirehashi/.test(hay)) return 'SCRAPS';
  if (/yorimichi|ヨリミチ/.test(hay)) return 'YORIMICHI';
  if (/news|ニュース/.test(hay)) return 'NEWS';
  if (/日記|diary|journal/.test(hay)) return 'DIARY';
  return 'ARTICLE';
}

function normalizeWp(post) {
  return {
    id: `wp-${post.id}`,
    type: classifyPost(post),
    title: stripHtml(post?.title?.rendered || '無題'),
    date: String(post?.date_gmt || post?.date || '')
  };
}

function withinRange(value, start, end) {
  const time = Date.parse(value || '');
  return Number.isFinite(time) && time >= start.getTime() && time < end.getTime();
}

async function loadWordPress(start, end) {
  const params = new URLSearchParams({
    after: start.toISOString(),
    before: end.toISOString(),
    per_page: '100',
    orderby: 'date',
    order: 'desc',
    _embed: '1'
  });
  const data = await fetchJson(`https://harf-way.com/wp-json/wp/v2/posts?${params}`);
  return Array.isArray(data) ? data.map(normalizeWp) : [];
}

async function loadYorimichi(start, end) {
  const data = await fetchJson('https://weekly-yorimichi-editor.vercel.app/api/issues');
  const issues = Array.isArray(data?.items) ? data.items : [];
  return issues
    .filter(issue => issue?.status === 'published' && withinRange(issue?.updated_at || issue?.created_at, start, end))
    .map(issue => ({
      id: `yorimichi-${issue.id}`,
      type: 'YORIMICHI',
      title: `${issue.issue_label || ''} ${issue.theme || 'ヨリミチ週刊'}`.trim(),
      date: String(issue.updated_at || issue.created_at || '')
    }));
}

function dedupe(items) {
  const seen = new Set();
  return items.filter(item => {
    const key = item.id || `${item.type}|${item.title}`.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function boardPriority(type) {
  const order = { YORIMICHI: 0, PLAYLIST: 1, SCRAPS: 2, ARTICLE: 3, NEWS: 4, DIARY: 9 };
  return order[type] ?? 6;
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return send(res, 405, { ok: false, error: 'method_not_allowed' });

  const { start, end } = mondayRange();
  const warnings = [];
  let wordpress = [];
  let yorimichi = [];

  const settled = await Promise.allSettled([
    loadWordPress(start, end),
    loadYorimichi(start, end)
  ]);

  if (settled[0].status === 'fulfilled') wordpress = settled[0].value;
  else warnings.push(`WordPress取得失敗: ${settled[0].reason?.message || 'unknown'}`);

  if (settled[1].status === 'fulfilled') yorimichi = settled[1].value;
  else warnings.push(`ヨリミチ週刊取得失敗: ${settled[1].reason?.message || 'unknown'}`);

  const verified = dedupe([...wordpress, ...yorimichi]);
  const board = verified
    .filter(item => item.type !== 'DIARY')
    .sort((a, b) => boardPriority(a.type) - boardPriority(b.type) || Date.parse(b.date || 0) - Date.parse(a.date || 0))
    .slice(0, 5);

  return send(res, 200, {
    ok: true,
    mode: 'preview-readonly',
    persisted: false,
    cronReady: true,
    generatedAt: new Date().toISOString(),
    range: {
      start: start.toISOString(),
      end: end.toISOString(),
      label: `${fmt(start)} → ${fmt(new Date(end.getTime() - 1))}`
    },
    draft: {
      gameIds: [],
      updateIds: board.map(item => item.id),
      verifiedIds: verified.map(item => item.id),
      note: 'GAME LOGのX / WAYSは別content instanceとして扱い、日時を安全に判定できないため自動選択しません。'
    },
    sources: {
      wordpress: { ok: settled[0].status === 'fulfilled', count: wordpress.length },
      yorimichi: { ok: settled[1].status === 'fulfilled', count: yorimichi.length }
    },
    warnings
  });
}
