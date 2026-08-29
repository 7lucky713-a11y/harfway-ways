import fs from 'node:fs';
import path from 'node:path';

const target = path.resolve('dist/ads-admin/index.html');
if (!fs.existsSync(target)) {
  console.log('[ads-admin-preview-auth] ads-admin page not found; skip');
  process.exit(0);
}

let html = fs.readFileSync(target, 'utf8');
const direct = 'https://ep-damp-resonance-awphji1s.neonauth.c-12.us-east-1.aws.neon.tech/neondb/auth';
const proxied = '/api/neon-auth-proxy';
if (!html.includes(direct)) {
  console.log('[ads-admin-preview-auth] direct Neon Auth URL not found; skip');
  process.exit(0);
}
html = html.replaceAll(direct, proxied);
fs.writeFileSync(target, html);
console.log('[ads-admin-preview-auth] routed ADS ADMIN auth through same-origin preview proxy');
