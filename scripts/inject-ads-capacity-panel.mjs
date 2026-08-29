import fs from 'node:fs';
import path from 'node:path';

const file = path.resolve('dist/ads-hub/index.html');
if (!fs.existsSync(file)) {
  console.log('[ads-capacity-panel] ads-hub output not found; skip');
  process.exit(0);
}

let html = fs.readFileSync(file, 'utf8');
const tag = '<script src="/ads-capacity-panel.js"></script>';
if (!html.includes(tag)) {
  html = html.includes('</body>') ? html.replace('</body>', `${tag}</body>`) : `${html}${tag}`;
  fs.writeFileSync(file, html);
}
console.log('[ads-capacity-panel] injected');
