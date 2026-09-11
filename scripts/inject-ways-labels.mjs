import fs from 'node:fs';

const file = 'dist/index.html';
if (!fs.existsSync(file)) throw new Error('[ways-labels] dist/index.html not found');
let html = fs.readFileSync(file, 'utf8');
const tag = '<script src="/ways-labels.js"></script>';
if (!html.includes(tag)) {
  if (!html.includes('</body>')) throw new Error('[ways-labels] </body> not found');
  html = html.replace('</body>', `${tag}</body>`);
  fs.writeFileSync(file, html);
  console.log('[ways-labels] frontend runtime injected');
} else {
  console.log('[ways-labels] frontend runtime already present');
}
