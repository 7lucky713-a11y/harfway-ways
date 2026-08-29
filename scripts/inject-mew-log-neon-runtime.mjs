import fs from 'node:fs';
import path from 'node:path';

const targets = [
  path.resolve('dist/mew-log/index.html'),
  path.resolve('dist/mew-log/admin/index.html')
];
const resetFix = '<script>document.getElementById("reset")?.setAttribute("id","clearInputs")</script>';
const runtimeTag = '<script src="/mew-log/neon-runtime.js"></script>';
const tag = `${resetFix}${runtimeTag}`;

for (const file of targets) {
  if (!fs.existsSync(file)) continue;
  let html = fs.readFileSync(file, 'utf8');
  if (!html.includes(runtimeTag)) {
    html = html.replace('</body>', `${tag}</body>`);
    fs.writeFileSync(file, html, 'utf8');
  }
}
console.log('[mew-log-neon-runtime] injected with reset collision guard');
