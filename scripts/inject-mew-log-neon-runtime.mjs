import fs from 'node:fs';
import path from 'node:path';

const targets = [
  path.resolve('dist/mew-log/index.html'),
  path.resolve('dist/mew-log/admin/index.html')
];
const runtimeTag = '<script src="/mew-log/neon-runtime.js"></script>';
const mediaCss = '<link rel="stylesheet" href="/mew-log/media.css">';

for (const file of targets) {
  if (!fs.existsSync(file)) continue;
  let html = fs.readFileSync(file, 'utf8');
  if (!html.includes(mediaCss)) html = html.replace('</head>', `${mediaCss}</head>`);
  if (!html.includes(runtimeTag)) html = html.replace('</body>', `${runtimeTag}</body>`);
  fs.writeFileSync(file, html, 'utf8');
}
console.log('[mew-log-neon-runtime] injected with media styles');
