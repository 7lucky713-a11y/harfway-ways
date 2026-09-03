import fs from 'node:fs/promises';

const SOURCE = 'https://harf-way-game-scrapbook.vercel.app/';
const OUT = 'public/scrapbook/index.html';
const PROD_HOSTS = "['harfway-playback.vercel.app','harfway-playback-harf-way.vercel.app'].includes(location.hostname)";
const WAYS_BRIDGE = '<script src="/scrapbook-ways-bridge.js"></script>';

const res = await fetch(SOURCE, { headers: { 'User-Agent': 'HARF-WAY-Scrapbook-Mirror/1.0' } });
if (!res.ok) throw new Error(`Scrapbook source fetch failed: ${res.status}`);
let html = await res.text();

const replacements = [
  [
    "const ADS='https://harfway-ads-delivery.vercel.app';",
    "const ADS='https://harfway-ads-delivery.vercel.app';\nconst ADS_SERVE='/api/ads-fair-serve';\nconst ADS_TRACK_ENABLED=" + PROD_HOSTS + ";\nconst SCRAPS_LAST_AD_KEY='hwads_last_scraps';"
  ],
  [
    "let all=[],active='ALL',adObserver=null;",
    "let all=[],active='ALL',adObserver=null;\nfunction lastScrapsAdId(){try{const v=String(localStorage.getItem(SCRAPS_LAST_AD_KEY)||'').trim().toLowerCase();return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(v)?v:''}catch{return ''}}\nfunction rememberScrapsAd(ad){if(!ad?.id)return;try{localStorage.setItem(SCRAPS_LAST_AD_KEY,String(ad.id).toLowerCase())}catch{}}"
  ],
  [
    "async function event(ad,type,tags){return req(ADS+'/api/event'",
    "async function event(ad,type,tags){if(!ADS_TRACK_ENABLED)return null;return req(ADS+'/api/event'"
  ],
  [
    "req(ADS+'/api/serve?placement=scraps&tags='",
    "req(ADS_SERVE+'?placement=scraps&tags='"
  ],
  [
    "+'&sid='+encodeURIComponent(sid()));if(!d.ad)",
    "+'&sid='+encodeURIComponent(sid())+'&avoid='+encodeURIComponent(lastScrapsAdId()));if(!d.ad)"
  ],
  [
    ".sp-media{width:100%;height:100%;object-fit:cover;display:block}",
    ".sp-media{width:100%;height:100%;object-fit:cover;display:block}.sp-media-fallback{width:100%;height:100%;display:grid;place-items:center;padding:18px;text-align:center;color:#ead46e;background:repeating-linear-gradient(-45deg,#22231c,#22231c 10px,#2a2b22 10px,#2a2b22 20px);font:900 18px/1.2 ui-monospace,monospace}.sp-media-fallback[hidden]{display:none}"
  ],
  [
    "if(ad.mediaUrl){art.innerHTML=(ad.mediaMime||'').startsWith('video/')?`<video class=\"sp-media\" src=\"${esc(ad.mediaUrl)}\" autoplay muted loop playsinline></video>`:`<img class=\"sp-media\" src=\"${esc(ad.mediaUrl)}\" alt=\"\">`}sp.classList.add('show');",
    "if(ad.mediaUrl){if((ad.mediaMime||'').startsWith('video/')){art.innerHTML=`<video class=\"sp-media\" src=\"${esc(ad.mediaUrl)}\" muted loop playsinline preload=\"metadata\"></video><div class=\"sp-media-fallback\" hidden>${esc(ad.title||'PROMOTED')}</div>`;const mv=art.querySelector('video'),fb=art.querySelector('.sp-media-fallback');const reveal=()=>{if(fb)fb.hidden=true};const fail=()=>{if(mv)mv.style.display='none';if(fb)fb.hidden=false};mv?.addEventListener('loadeddata',reveal,{once:true});mv?.addEventListener('playing',reveal,{once:true});mv?.addEventListener('error',fail,{once:true});mv?.load();mv?.play().catch(()=>{})}else{art.innerHTML=`<img class=\"sp-media\" src=\"${esc(ad.mediaUrl)}\" alt=\"\">`}}sp.classList.add('show');rememberScrapsAd(ad);"
  ],
  [
    "  const ANALYTICS_ENV='production';",
    "  const ANALYTICS_ENV='production';\n  const ANALYTICS_TRACK_ENABLED=" + PROD_HOSTS + ";"
  ],
  [
    "function track(eventType,eventValue=null,metadata={}){if(!memoId)return;fetch(",
    "function track(eventType,eventValue=null,metadata={}){if(!ANALYTICS_TRACK_ENABLED||!memoId)return;fetch("
  ],
];

for (const [before, after] of replacements) {
  if (!html.includes(before)) throw new Error(`Scrapbook mirror expected source not found: ${before.slice(0, 80)}`);
  html = html.replace(before, after);
}

if (!html.includes(WAYS_BRIDGE)) {
  if (!html.includes('</body>')) throw new Error('Scrapbook body closing tag missing');
  html = html.replace('</body>', `${WAYS_BRIDGE}\n</body>`);
}

if (!html.includes("const ADS_SERVE='/api/ads-fair-serve';")) throw new Error('Scrapbook fair-v2 patch missing');
if (!html.includes('ADS_TRACK_ENABLED')) throw new Error('Scrapbook preview tracking guard missing');
if (!html.includes('sp-media-fallback')) throw new Error('Scrapbook ad media fallback patch missing');
if (!html.includes("SCRAPS_LAST_AD_KEY='hwads_last_scraps'")) throw new Error('Scrapbook ad rotation key missing');
if (!html.includes("+'&avoid='+encodeURIComponent(lastScrapsAdId())")) throw new Error('Scrapbook ad rotation avoid missing');
if (!html.includes('rememberScrapsAd(ad)')) throw new Error('Scrapbook ad rotation memory missing');
if (!html.includes(WAYS_BRIDGE)) throw new Error('Scrapbook WAYS bridge injection missing');

await fs.mkdir('public/scrapbook', { recursive: true });
await fs.writeFile(OUT, html, 'utf8');
console.log(`[scrapbook-mirror] wrote ${OUT} (${html.length} chars), fair-v2 serve, preview tracking off, ad media playback hardened, reload rotation enabled, WAYS play-footage bridge enabled`);
