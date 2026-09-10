import fs from 'node:fs';
import path from 'node:path';

const targets = [
  'dist/game-notes/index.html',
  'dist/game-notes/workflow/index.html',
  'dist/private-clips/index.html'
];
const tag = '<script src="/private-tools/shell.js"></script>';

for (const file of targets) {
  const full = path.resolve(file);
  if (!fs.existsSync(full)) throw new Error(`[private-tools-shell] missing ${file}`);
  let html = fs.readFileSync(full, 'utf8');
  if (html.includes('/private-tools/shell.js')) continue;
  if (!html.includes('</body>')) throw new Error(`[private-tools-shell] </body> missing in ${file}`);
  html = html.replace('</body>', `${tag}</body>`);
  fs.writeFileSync(full, html);
  console.log(`[private-tools-shell] injected ${file}`);
}
