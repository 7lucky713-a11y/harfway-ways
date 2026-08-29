import fs from 'node:fs';
import path from 'node:path';

const dist = path.resolve('dist');
const direct = 'https://ep-damp-resonance-awphji1s.neonauth.c-12.us-east-1.aws.neon.tech/neondb/auth';
const runtimeExpression = 'window.location.origin+"/api/neon-auth-proxy"';

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (/\.(?:html|js)$/.test(entry.name)) out.push(full);
  }
  return out;
}

if (!fs.existsSync(dist)) {
  console.error('[ads-admin-preview-auth] dist not found');
  process.exit(1);
}

let replacements = 0;
const touched = [];
for (const file of walk(dist)) {
  if (!file.includes('ads-admin') && !file.endsWith('index.html')) continue;
  let text = fs.readFileSync(file, 'utf8');
  const before = text;

  for (const quote of ['"', "'", '`']) {
    const needle = `${quote}${direct}${quote}`;
    if (text.includes(needle)) {
      const count = text.split(needle).length - 1;
      text = text.replaceAll(needle, runtimeExpression);
      replacements += count;
    }
  }

  if (text !== before) {
    fs.writeFileSync(file, text);
    touched.push(path.relative(dist, file));
  }
}

if (!replacements) {
  console.error('[ads-admin-preview-auth] Neon Auth literal not found; refusing silent Preview build');
  process.exit(1);
}

console.log(`[ads-admin-preview-auth] routed ADS ADMIN auth through runtime same-origin proxy (${replacements} replacement${replacements === 1 ? '' : 's'})`);
for (const file of touched) console.log(`[ads-admin-preview-auth] touched: ${file}`);
