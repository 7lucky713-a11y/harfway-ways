import fs from 'node:fs';

const targets = [
  'api/weekly-harfway-draft.js',
  'api/weekly-harfway-source.js'
];

const replacement = `function targetScrapWeek(start, end) {
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
    title: \`ゲームの切れ端\${year}年\${month}月\${week}週目\`,
    slugTail: \`\${year}_\${monthSlug}\${week}week\`
  };
}

function isRepresentedScrap(post, target) {
  const title = stripHtml(post?.title?.rendered || '').replace(/\\s+/g, '');
  const slug = String(post?.slug || '').toLowerCase();
  const link = String(post?.link || '');
  if (!/\\/weekly\\/scraps\\//i.test(link)) return false;
  if (title === target.title.replace(/\\s+/g, '')) return true;
  return target.slugTail && slug.endsWith(target.slugTail.toLowerCase());
}

async function loadScrapPages(start, end) {
  // SCRAPS is a normal wp/v2/posts entry. Its publication time may be Sunday/Monday
  // outside the represented Monday-Sunday week, so match by the week encoded in title/slug.
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
  const data = await fetchJson(\`https://harf-way.com/wp-json/wp/v2/posts?\${params}\`);
  return Array.isArray(data)
    ? data.filter(post => isRepresentedScrap(post, target)).map(post => normalizeWp(post, 'post'))
    : [];
}`;

const blockRe = /async function loadScrapPages\(start, end\) \{[\s\S]*?\n\}\n\nasync function loadYorimichi/;

for (const file of targets) {
  const before = fs.readFileSync(file, 'utf8');
  if (!blockRe.test(before)) {
    throw new Error(`[weekly-scraps-week] target block not found: ${file}`);
  }
  const after = before.replace(blockRe, `${replacement}\n\nasync function loadYorimichi`);
  fs.writeFileSync(file, after);
  console.log(`[weekly-scraps-week] represented-week matcher applied: ${file}`);
}
