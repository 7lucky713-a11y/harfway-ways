import fs from 'node:fs';
import path from 'node:path';

if (process.env.VERCEL_ENV !== 'preview') {
  console.log('[ads-admin-preview-auth] skipped outside Preview');
  process.exit(0);
}

const dist = path.resolve('dist');
const directAuth = 'https://ep-damp-resonance-awphji1s.neonauth.c-12.us-east-1.aws.neon.tech/neondb/auth';
const runtimeAuth = 'window.location.origin+"/api/neon-auth-proxy"';

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else if (/\.(?:html|js)$/.test(entry.name)) out.push(full);
  }
  return out;
}

function replaceLiteral(text, direct, replacement) {
  let count = 0;
  for (const quote of ['"', "'", '`']) {
    const needle = `${quote}${direct}${quote}`;
    if (!text.includes(needle)) continue;
    count += text.split(needle).length - 1;
    text = text.replaceAll(needle, replacement);
  }
  return { text, count };
}

if (!fs.existsSync(dist)) {
  console.error('[ads-admin-preview-auth] dist not found');
  process.exit(1);
}

let authReplacements = 0;
const touched = [];
for (const file of walk(dist)) {
  if (!file.includes('ads-admin') && !file.endsWith('index.html')) continue;
  let text = fs.readFileSync(file, 'utf8');
  const before = text;
  const auth = replaceLiteral(text, directAuth, runtimeAuth);
  text = auth.text;
  authReplacements += auth.count;
  if (text !== before) {
    fs.writeFileSync(file, text);
    touched.push(path.relative(dist, file));
  }
}

if (!authReplacements) {
  console.error('[ads-admin-preview-auth] auth literal missing; refusing silent Preview build');
  process.exit(1);
}
console.log(`[ads-admin-preview-auth] routed only Neon Auth through same-origin Preview proxy (auth=${authReplacements}); Data API remains direct like Production`);
for (const file of touched) console.log(`[ads-admin-preview-auth] touched: ${file}`);
