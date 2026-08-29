import fs from 'node:fs';

const file = 'public/ways-ads.js';
const source = fs.readFileSync(file, 'utf8');
const before = `    card?.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (!ad.storeUrl || ad.storeUrl === '#') return;
      window.open(ad.storeUrl, '_blank', 'noopener');
      record('click');
      record('store_visit');
    });`;
const after = `    card?.addEventListener('click', (e) => {
      if (!e.target.closest?.('.cover')) return;
      e.preventDefault();
      e.stopPropagation();
      if (!ad.storeUrl || ad.storeUrl === '#') return;
      window.open(ad.storeUrl, '_blank', 'noopener');
      record('click');
      record('store_visit');
    });`;

if (!source.includes(before)) throw new Error('[ways-ads-link-scope] expected desktop sponsor click block not found');
fs.writeFileSync(file, source.replace(before, after));
console.log('[ways-ads-link-scope] desktop sponsor jump limited to visual area');
