import fs from 'node:fs';
import path from 'node:path';

const dist = path.resolve('dist');
const direct = 'https://ep-damp-resonance-awphji1s.neonauth.c-12.us-east-1.aws.neon.tech/neondb/auth';
const proxied = '/api/neon-auth-proxy';

if (!fs.existsSync(dist)) {
  console.error('[ads-admin-preview-auth] dist not found');
  process.exit(1);
}

function walk(dir) {
  const out = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) out.push(...walk(full));
    else out.push(full);
  }
  return out;
}

const candidates = walk(dist).filter((file) => {
  const rel = path.relative(dist, file).replaceAll('\\', '/');
  return rel === 'ads-admin/index.html' || /(^|\/)ads-admin[^/]*\.js$/i.test(rel);
});

let replacements = 0;
const touched = [];
for (const file of candidates) {
  let text = fs.readFileSync(file, 'utf8');
  if (!text.includes(direct)) continue;
  const count = text.split(direct).length - 1;
  text = text.replaceAll(direct, proxied);
  fs.writeFileSync(file, text);
  replacements += count;
  touched.push(path.relative(dist, file).replaceAll('\\', '/'));
}

if (!replacements) {
  console.error('[ads-admin-preview-auth] direct Neon Auth URL not found in ADS ADMIN build output');
  console.error('[ads-admin-preview-auth] candidates:', candidates.map((f) => path.relative(dist, f).replaceAll('\\', '/')).join(', '));
  process.exit(1);
}

console.log(`[ads-admin-preview-auth] routed ADS ADMIN auth through same-origin preview proxy (${replacements} replacement${replacements === 1 ? '' : 's'})`);
console.log('[ads-admin-preview-auth] touched:', touched.join(', '));
