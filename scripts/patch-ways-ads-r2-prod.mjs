import fs from 'node:fs';

const file = 'public/ways-ads.js';
let source = fs.readFileSync(file, 'utf8');

const serveBefore = "  const SERVE = TRACK_ENABLED ? `${ADS}/api/serve` : '/api/ads-fair-serve';";
const serveAfter = "  const SERVE = '/api/ads-fair-serve';";

const desktopStage = `    card?.addEventListener('click', (e) => {
      e.preventDefault();
      e.stopPropagation();
      openDesktopAd();
    });`;
const desktopDirect = `    card?.addEventListener('click', (e) => {
      if (!e.target.closest?.('.cover')) return;
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

if (source.includes(serveBefore)) source = source.replace(serveBefore, serveAfter);
else if (!source.includes(serveAfter)) throw new Error('[ways-ads-r2] serve path not found');

// Desktop ad cards are WAYS content first: open the promoted creative in the
// center stage. Only the explicit PROMOTED STORE CTA should leave WAYS.
if (source.includes(desktopDirect)) source = source.replace(desktopDirect, desktopStage);
else if (!source.includes(desktopStage)) throw new Error('[ways-ads-r2] desktop stage click block not found');

if (source.includes(mobileBefore)) source = source.replace(mobileBefore, mobileAfter);
else if (!source.includes(mobileAfter)) throw new Error('[ways-ads-r2] mobile click block not found');

fs.writeFileSync(file, source);
console.log('[ways-ads-r2] fair-v2 serve + desktop stage preview + mobile direct sponsor link applied');
