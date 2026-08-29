import fs from 'node:fs';
import path from 'node:path';

const targets = [
  path.resolve('dist/mew-log/index.html'),
  path.resolve('dist/mew-log/admin/index.html')
];
const runtimeTag = '<script src="/mew-log/neon-runtime.js"></script>';
const mediaCss = '<link rel="stylesheet" href="/mew-log/media.css">';

const r2Flags = {
  accountId: Boolean(process.env.R2_ACCOUNT_ID),
  accessKey: Boolean(process.env.R2_ACCESS_KEY_ID),
  secretKey: Boolean(process.env.R2_SECRET_ACCESS_KEY),
  bucket: Boolean(process.env.R2_BUCKET),
  publicBase: Boolean(process.env.R2_PUBLIC_BASE_URL)
};
console.log('[mew-log-r2-env]', JSON.stringify(r2Flags));

for (const file of targets) {
  if (!fs.existsSync(file)) continue;
  let html = fs.readFileSync(file, 'utf8');
  if (!html.includes(mediaCss)) html = html.replace('</head>', `${mediaCss}</head>`);
  if (!html.includes(runtimeTag)) html = html.replace('</body>', `${runtimeTag}</body>`);
  fs.writeFileSync(file, html, 'utf8');
}
console.log('[mew-log-neon-runtime] injected with media styles');
