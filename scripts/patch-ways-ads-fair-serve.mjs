import fs from 'node:fs';

const file = 'public/ways-ads.js';
const source = fs.readFileSync(file, 'utf8');

const serveBefore = "  const SERVE = TRACK_ENABLED ? `${ADS}/api/serve` : '/api/ads-fair-serve';";
const serveAfter = "  const SERVE = '/api/ads-fair-serve';";

const desktopBefore = `    card?.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      openDesktopAd();
    });`;
const desktopAfter = `    card?.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      if (!ad.storeUrl || ad.storeUrl === '#') return;
      window.open(ad.storeUrl, '_blank', 'noopener');
      record('click');
      record('store_visit');
    });`;

const mobileBefore = `    const card = feed.querySelector('.ways-ad-mobile');
    card?.querySelector('.ways-ad-mobile-store')?.addEventListener('click', async () => {
      await record('click');
      await record('store_visit');
    }, true);
    observeMobileImpression(card);`;
const mobileAfter = `    const card = feed.querySelector('.ways-ad-mobile');
    card?.querySelector('.ways-ad-mobile-store')?.addEventListener('click', async () => {
      await record('click');
      await record('store_visit');
    }, true);
    card?.addEventListener('click', (e) => {
      if (!e.target.closest?.('.ways-ad-mobile-media,.ways-ad-mobile-fallback')) return;
      if (!ad.storeUrl || ad.storeUrl === '#') return;
      e.preventDefault();
      e.stopPropagation();
      window.open(ad.storeUrl, '_blank', 'noopener');
      record('click');
      record('store_visit');
    });
    observeMobileImpression(card);`;

let next = source;
if (next.includes(serveBefore)) next = next.replace(serveBefore, serveAfter);
else if (!next.includes(serveAfter)) throw new Error('[ways-ads-fair] expected serve line not found');

if (next.includes(desktopBefore)) next = next.replace(desktopBefore, desktopAfter);
else if (!next.includes(desktopAfter)) throw new Error('[ways-ads-link] expected desktop click block not found');

if (next.includes(mobileBefore)) next = next.replace(mobileBefore, mobileAfter);
else if (!next.includes(mobileAfter)) throw new Error('[ways-ads-link] expected mobile click block not found');

fs.writeFileSync(file, next);
console.log('[ways-ads-fair] WAYS serve path switched to local fair-v2; event path unchanged');
console.log('[ways-ads-link] WAYS ad media opens sponsor URL directly; preview tracking remains disabled');
