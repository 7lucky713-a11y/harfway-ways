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

function normalizeWp(post, kind = 'post') {
  const image = post?._embedded?.['wp:featuredmedia']?.[0]?.source_url || '';
  const title = stripHtml(post?.title?.rendered || '無題');
  const summary = stripHtml(post?.excerpt?.rendered || '').slice(0, 220);
  const type = kind === 'page' ? 'SCRAPS' : classifyPost(post);
  return {
    id: kind === 'page' ? `wp-page-${post.id}` : `wp-${post.id}`,
    source: kind === 'page' ? 'HARF-WAY / 固定ページ' : 'HARF-WAY',
    type,
    title,
    summary,
    url: String(post?.link || ''),
    image: String(image || ''),
    date: String(kind === 'page'
      ? (post?.modified_gmt || post?.modified || post?.date_gmt || post?.date || '')
      : (post?.date_gmt || post?.date || '')),
    eligible: true,
    weeklyVerified: true,
    meta: { wpId: post.id, wpKind: kind }
  };
}

function withinRange(value, start, end) {
  const time = Date.parse(value || '');
  return Number.isFinite(time) && time >= start.getTime() && time < end.getTime();
}

function isScrapPage(page) {
  const link = String(page?.link || '');
  const title = stripHtml(page?.title?.rendered || '');
  try {
    const path = new URL(link).pathname.replace(/\/+$/, '');
    if (/^\/weekly\/scraps\/.+/i.test(path)) return true;
  } catch {}
  return /ゲームの切れ端|切れ端/.test(title) && /\/weekly\/scraps\//i.test(link);
}

async function loadWordPressPosts(start, end) {
  const graceEnd = new Date(end.getTime() + DAY_MS);
  const params = new URLSearchParams({
    after: start.toISOString(),
    before: graceEnd.toISOString(),
    per_page: '100',
    orderby: 'date',
    order: 'desc',
    _embed: '1'
  });
  const data = await fetchJson(`https://harf-way.com/wp-json/wp/v2/posts?${params}`);
  if (!Array.isArray(data)) return [];
  return data
    .map(post => normalizeWp(post, 'post'))
    .filter(item => item.type === 'SCRAPS'
      ? withinRange(item.date, start, graceEnd)
      : withinRange(item.date, start, end));
}

async function loadScrapPages(start, end) {
  const params = new URLSearchParams({
    modified_after: start.toISOString(),
    modified_before: end.toISOString(),
    per_page: '100',
    orderby: 'modified',
    order: 'desc',
    _embed: '1'
  });
  const data = await fetchJson(`https://harf-way.com/wp-json/wp/v2/pages?${params}`);
  return Array.isArray(data)
    ? data.filter(isScrapPage).map(page => normalizeWp(page, 'page'))
    : [];
}

async function loadYorimichi(start, end) {
  const data = await fetchJson('https://weekly-yorimichi-editor.vercel.app/api/issues');
  const issues = Array.isArray(data?.items) ? data.items : [];
  return issues
    .filter(issue => issue?.status === 'published' && withinRange(issue?.updated_at || issue?.created_at, start, end))
    .map(issue => ({
      id: `yorimichi-${issue.id}`,
      source: 'WEEKLY YORIMICHI',
      type: 'YORIMICHI',
      title: `${issue.issue_label || ''} ${issue.theme || 'ヨリミチ週刊'}`.trim(),
      summary: `期間 ${issue.date_from || ''} → ${issue.date_to || ''}`,
      url: 'https://weekly-yorimichi-editor.vercel.app/',
      image: '',
      date: String(issue.updated_at || issue.created_at || ''),
      eligible: true,
      weeklyVerified: true,
      meta: { issueId: issue.id, internalEditor: true }
    }));
}

async function loadWays() {
  const data = await fetchJson('https://harfway-playback.vercel.app/api/games-live');
  const entries = Array.isArray(data?.entries) ? data.entries : [];
  return {
    count: entries.length,
    items: entries
      .sort((a, b) => Number(a?.sortOrder || 0) - Number(b?.sortOrder || 0))
      .slice(0, 30)
      .map((game, index) => ({
        id: `ways-${game.id || index}`,
        source: 'WAYS',
        type: 'WAYS',
        title: String(game?.title || '無題'),
        summary: String(game?.description || '').slice(0, 220),
        url: String(game?.articleUrl || game?.storeUrl || 'https://harfway-playback.vercel.app/'),
        image: String(game?.thumbnailUrl || ''),
        video: String(game?.video || ''),
        date: '',
        eligible: false,
        weeklyVerified: false,
        meta: {
          note: 'WAYSは現行APIに追加日時がないため、週次差分ではなく現行棚の候補として表示',
          storeUrl: String(game?.storeUrl || ''),
          articleUrl: String(game?.articleUrl || '')
        }
      }))
  };
}

function dedupe(items) {
  const seen = new Set();
  return items.filter(item => {
    const key = `${item.type}|${item.url || item.title}`.toLowerCase();
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return send(res, 405, { ok: false, error: 'method_not_allowed' });

  const { start, end } = mondayRange();
  const warnings = [];
  let wordpressPosts = [];
  let scrapPages = [];
  let yorimichi = [];
  let ways = { count: 0, items: [] };

  const settled = await Promise.allSettled([
    loadWordPressPosts(start, end),
    loadScrapPages(start, end),
    loadYorimichi(start, end),
    loadWays()
  ]);

  if (settled[0].status === 'fulfilled') wordpressPosts = settled[0].value;
  else warnings.push(`WordPress投稿取得失敗: ${settled[0].reason?.message || 'unknown'}`);

  if (settled[1].status === 'fulfilled') scrapPages = settled[1].value;
  else warnings.push(`切れ端固定ページ取得失敗: ${settled[1].reason?.message || 'unknown'}`);

  if (settled[2].status === 'fulfilled') yorimichi = settled[2].value;
  else warnings.push(`ヨリミチ週刊取得失敗: ${settled[2].reason?.message || 'unknown'}`);

  if (settled[3].status === 'fulfilled') ways = settled[3].value;
  else warnings.push(`WAYS取得失敗: ${settled[3].reason?.message || 'unknown'}`);

  const weeklyItems = dedupe([...wordpressPosts, ...scrapPages, ...yorimichi]).sort((a, b) => Date.parse(b.date || 0) - Date.parse(a.date || 0));
  const items = [...weeklyItems, ...ways.items];
  const typeCounts = weeklyItems.reduce((acc, item) => {
    acc[item.type] = (acc[item.type] || 0) + 1;
    return acc;
  }, {});

  return send(res, 200, {
    ok: true,
    generatedAt: new Date().toISOString(),
    range: {
      start: start.toISOString(),
      end: end.toISOString(),
      label: `${fmt(start)} → ${fmt(new Date(end.getTime() - 1))}`
    },
    sourcePolicy: {
      mondayScrapsGrace: true,
      mondayScrapsGraceEnd: new Date(end.getTime() + DAY_MS).toISOString()
    },
    sources: {
      wordpress: { ok: settled[0].status === 'fulfilled', count: wordpressPosts.length, scrapsCount: wordpressPosts.filter(item => item.type === 'SCRAPS').length },
      scrapPages: { ok: settled[1].status === 'fulfilled', count: scrapPages.length },
      yorimichi: { ok: settled[2].status === 'fulfilled', count: yorimichi.length },
      ways: {
        ok: settled[3].status === 'fulfilled',
        count: ways.count,
        weeklyDelta: false
      }
    },
    typeCounts,
    weeklyCount: weeklyItems.length,
    items,
    warnings
  });
}
