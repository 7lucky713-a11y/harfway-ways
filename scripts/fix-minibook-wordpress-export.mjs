import fs from 'node:fs';
import path from 'node:path';

const file = path.resolve('dist/game-notes/minibook-wordpress-v3/index.html');
if (!fs.existsSync(file)) {
  throw new Error(`[minibook-wordpress-fix] missing ${file}`);
}

const html = fs.readFileSync(file, 'utf8');
const lines = html.split('\n');
const index = lines.findIndex((line) => line.includes('function buildAll(pages)'));
if (index < 0) {
  throw new Error('[minibook-wordpress-fix] buildAll function not found');
}

lines[index] = "  function buildAll(pages){return buildHtmlCss(pages)+'\\n'+'<scr'+'ipt>'+exportJs()+'</scr'+'ipt>'}";

const fixed = lines.join('\n');
if (fixed.includes("replace(/<\\\\/script/gi")) {
  throw new Error('[minibook-wordpress-fix] broken script escape still present');
}

fs.writeFileSync(file, fixed);
console.log('[minibook-wordpress-fix] patched copy exporter runtime');
