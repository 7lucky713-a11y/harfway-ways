import fs from 'node:fs/promises';

const FILE = 'dist/ads-admin/index.html';
const MARK = '<script src="/ads-admin-health.js"></script>';
let html = await fs.readFile(FILE, 'utf8');

if (!html.includes(MARK)) {
  if (!html.includes('</body>')) throw new Error('ADS ADMIN </body> not found');
  html = html.replace('</body>', `${MARK}\n</body>`);
  await fs.writeFile(FILE, html, 'utf8');
}

if (!html.includes(MARK)) throw new Error('ADS ADMIN health injection failed');
console.log('[ads-admin-health] injected');
