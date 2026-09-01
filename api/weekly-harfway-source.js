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
  const image = post?._embedded?.['wp:featuredmedia']?.[0]?.source_url || '';
  return {
    id: `wp-${post.id}`,
    source: 'HARF-WAY',
    type: classifyPost(post),
    title: stripHtml(post?.title?.rendered || '無題'),
    summary: stripHtml(post?.excerpt?.rendered || '').slice(0, 220),
    url: String(post?.link || ''),
    image: String(image || ''),
    date: String(post?.date_gmt || post?.date || ''),
    eligible: true,
    weeklyVerified: true,
    meta: { wpId: post.id, wpKind: 'post' }
  };
}

function withinRange(value, start, end) {
  const time = Date.parse(value || '');
  return Number.isFinite(time) && time >= start.getTime() && time < end.getTime();
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
    .map(normalizeWp)
    .filter(item => item.type === 'SCRAPS'
      ? withinRange(item.date, start, graceEnd)
      : withinRange(item.date, start, end));
}

function targetScrapWeek(start, end) {
  const sunday = new Date(end.getTime() - 1);
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'Asia/Tokyo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(sunday);
  const get = type => parts.find(part => part.type === type)?.value || '';
  const year = Number(get('year'));
  const month = Number(get('month'));
  const day = Number(get('day'));
  const week = Math.ceil(day / 7);
  const monthSlug = [
    'january','february','march','april','may','june',
    'july','august','september','october','november','december'
  ][month - 1] || '';
  return {
    year,
    month,
    week,
    monthSlug,
    title: `ゲームの切れ端${year}年${month}月${week}週目`,
    slugTail: `${year}_${monthSlug}${week}week`
  };
}

function isRepresentedScrap(post, target) {
  const title = stripHtml(post?.title?.rendered || '').replace(/\s+/g, '');
  const slug = String(post?.slug || '').toLowerCase();
  const link = String(post?.link || '');
  if (!/\/weekly\/scraps\//i.test(link)) return false;
  if (title === target.title.replace(/\s+/g, '')) return true;
  return target.slugTail && slug.endsWith(target.slugTail.toLowerCase());
}

async function loadRepresentedScraps(start, end) {
  const target = targetScrapWeek(start, end);
  const after = new Date(start.getTime() - 14 * DAY_MS);
  const before = new Date(end.getTime() + 3 * DAY_MS);
  const params = new URLSearchParams({
    after: after.toISOString(),
    before: before.toISOString(),
    per_page: '100',
    orderby: 'date',
    order: 'desc',
    _embed: '1'
  });
  const data = await fetchJson(`https://harf-way.com/wp-json/wp/v2/posts?${params}`);
  return Array.isArray(data)
    ? data.filter(post => isRepresentedScrap(post, target)).map(normalizeWp)
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
  const sorted = [...entries].sort((a, b) => Number(a?.sortOrder || 0) - Number(b?.sortOrder || 0));
  return {
    count: entries.length,
    returnedCount: sorted.length,
    items: sorted.map((game, index) => ({
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
    const key = item.id || `${item.type}|${item.url || item.title}`.toLowerCase();
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
  let representedScraps = [];
  let yorimichi = [];
  let ways = { count: 0, returnedCount: 0, items: [] };

  const settled = await Promise.allSettled([
    loadWordPressPosts(start, end),
    loadRepresentedScraps(start, end),
    loadYorimichi(start, end),
    loadWays()
  ]);

  if (settled[0].status === 'fulfilled') wordpressPosts = settled[0].value;
  else warnings.push(`WordPress投稿取得失敗: ${settled[0].reason?.message || 'unknown'}`);

  if (settled[1].status === 'fulfilled') representedScraps = settled[1].value;
  else warnings.push(`切れ端represented week取得失敗: ${settled[1].reason?.message || 'unknown'}`);

  if (settled[2].status === 'fulfilled') yorimichi = settled[2].value;
  else warnings.push(`ヨリミチ週刊取得失敗: ${settled[2].reason?.message || 'unknown'}`);

  if (settled[3].status === 'fulfilled') ways = settled[3].value;
  else warnings.push(`WAYS取得失敗: ${settled[3].reason?.message || 'unknown'}`);

  const weeklyItems = dedupe([...wordpressPosts, ...representedScraps, ...yorimichi]).sort((a, b) => Date.parse(b.date || 0) - Date.parse(a.date || 0));
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
      scrapsRestType: 'wp/v2/posts',
      permalinkDoesNotDefineRestType: true,
      mondayScrapsGrace: true,
      mondayScrapsGraceEnd: new Date(end.getTime() + DAY_MS).toISOString(),
      representedWeekMatch: true,
      waysCandidateLimit: null
    },
    sources: {
      wordpress: { ok: settled[0].status === 'fulfilled', count: wordpressPosts.length, scrapsCount: wordpressPosts.filter(item => item.type === 'SCRAPS').length },
      representedScraps: { ok: settled[1].status === 'fulfilled', count: representedScraps.length },
      scrapPages: { ok: settled[1].status === 'fulfilled', count: representedScraps.length, deprecatedAlias: true },
      yorimichi: { ok: settled[2].status === 'fulfilled', count: yorimichi.length },
      ways: {
        ok: settled[3].status === 'fulfilled',
        count: ways.count,
        returnedCount: ways.returnedCount,
        weeklyDelta: false
      }
    },
    typeCounts,
    weeklyCount: weeklyItems.length,
    items,
    warnings
  });
}
