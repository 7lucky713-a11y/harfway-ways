import fs from 'node:fs';
import path from 'node:path';

const target = path.resolve('dist/ads-admin/index.html');
if (!fs.existsSync(target)) {
  console.log('[ads-admin-media-repair] ads-admin page not found; skip');
  process.exit(0);
}

let html = fs.readFileSync(target, 'utf8');
const marker = '<script src="/ads-portal-r2-shim.js"></script><script src="/ads-admin-media-repair.js"></script>';
if (html.includes('/ads-admin-media-repair.js')) {
  console.log('[ads-admin-media-repair] already injected');
  process.exit(0);
}

if (html.includes('<script type="module"')) {
  html = html.replace('<script type="module"', `${marker}<script type="module"`);
} else {
  html = html.replace('</body>', `${marker}</body>`);
}
fs.writeFileSync(target, html);
console.log('[ads-admin-media-repair] injected');
