const DEFAULT_R2_ORIGIN = 'https://pub-2d323c5412584bc480059c19872176e1.r2.dev';

function escapeHtml(value = '') {
  return String(value).replace(/[&<>"']/g, (char) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[char]);
}

function queryValue(value, fallback = '') {
  return String(Array.isArray(value) ? value[0] : (value ?? fallback)).trim();
}

function decodeToken(token = '') {
  if (!/^[A-Za-z0-9_-]{8,4096}$/.test(token)) return '';
  try {
    return Buffer.from(token, 'base64url').toString('utf8');
  } catch {
    return '';
  }
}

function allowedOrigins() {
  const values = [
    process.env.R2_PUBLIC_BASE_URL,
    process.env.R2_PUBLIC_URL,
    process.env.CLOUDFLARE_R2_PUBLIC_URL,
    DEFAULT_R2_ORIGIN
  ].filter(Boolean);
  const origins = new Set();
  for (const value of values) {
    try { origins.add(new URL(String(value)).origin); } catch {}
  }
  return origins;
}

function validMediaUrl(raw = '') {
  try {
    const url = new URL(raw);
    if (url.protocol !== 'https:') return '';
    if (!allowedOrigins().has(url.origin)) return '';
    if (!/\.(mp4|webm|mov|m4v)(?:$|[?#])/i.test(url.href)) return '';
    return url.toString();
  } catch {
    return '';
  }
}

function titleFromUrl(raw = '') {
  try {
    const url = new URL(raw);
    const part = url.pathname.split('/').filter(Boolean).pop() || 'R2 VIDEO';
    const decoded = decodeURIComponent(part).replace(/\.(mp4|webm|mov|m4v)$/i, '');
    return decoded || 'R2 VIDEO';
  } catch {
    return 'R2 VIDEO';
  }
}

export default async function handler(req, res) {
  if (req.method !== 'GET') return res.status(405).end('Method Not Allowed');

  const token = queryValue(req.query?.token);
  const decoded = decodeToken(token);
  const video = validMediaUrl(decoded);
  if (!video) {
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('Cache-Control', 'no-store');
    return res.status(404).end('<!doctype html><meta charset="utf-8"><title>HARF-WAY / VIDEO NOT FOUND</title><body style="margin:0;background:#090909;color:#fff;font-family:system-ui;display:grid;place-items:center;height:100vh">動画を読み込めませんでした。</body>');
  }

  const title = titleFromUrl(video);
  const safeTitle = escapeHtml(title);
  const safeVideo = escapeHtml(video);
  const html = `<!doctype html><html lang="ja"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><meta name="theme-color" content="#090909"><title>${safeTitle} | HARF-WAY</title><style>
:root{color-scheme:dark;--bg:#090909;--line:#292b30;--text:#f5f5ef;--muted:#999da5;--accent:#efff35}
*{box-sizing:border-box}html,body{margin:0;width:100%;height:100%;overflow:hidden;background:var(--bg);color:var(--text);font-family:Inter,-apple-system,BlinkMacSystemFont,"Segoe UI","Noto Sans JP",sans-serif}.embed-shell{width:100vw;height:100vh;display:grid;grid-template-rows:minmax(0,1fr) 46px;background:#080808;overflow:hidden}.frame{min-width:0;min-height:0;overflow:hidden;background:#000}.frame video{display:block;width:100%;height:100%;object-fit:contain;background:#000}.embed-bar{min-width:0;overflow:hidden;display:flex;gap:8px;align-items:center;padding:6px 8px;border-top:1px solid var(--line);background:#0d0e10}.play,.sound{height:32px;border:1px solid #343840;border-radius:7px;background:#17191d;color:var(--text);font:800 10px/1 system-ui;cursor:pointer}.play{padding:0 10px;min-width:58px}.sound{width:34px;padding:0}.audio{display:flex;align-items:center;gap:6px}.volume{width:78px;accent-color:var(--accent)}.embed-copy{flex:1 1 auto;min-width:0;overflow:hidden}.brand{font-size:7px;line-height:1;margin-bottom:3px;letter-spacing:.15em;color:var(--accent);font-weight:900}.title{min-width:0;font-size:10px;line-height:1.1;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;font-weight:950;letter-spacing:-.02em}.mark{flex:0 0 auto;color:var(--muted);font-size:8px;font-weight:850;letter-spacing:.08em}@media(max-width:430px){.volume{display:none}.embed-copy .brand{display:none}.title{font-size:9px}.play{min-width:54px;padding:0 8px}.mark{font-size:7px}}
</style></head><body><main class="embed-shell"><div class="frame"><video id="hwVideo" playsinline webkit-playsinline loop preload="metadata" controlslist="nodownload nofullscreen noplaybackrate noremoteplayback" disablepictureinpicture src="${safeVideo}"></video></div><div class="embed-bar"><button id="hwPlay" class="play" type="button">▶ 再生</button><div class="embed-copy"><div class="brand">HARF-WAY / VIDEO</div><div class="title">${safeTitle}</div></div><div class="audio"><button id="hwSound" class="sound" type="button" aria-label="ミュート切り替え" title="音声">🔇</button><input id="hwVolume" class="volume" type="range" min="0" max="1" step="0.05" value="0.7" aria-label="音量"></div><div class="mark">R2</div></div></main><script>
(function(){
  const video=document.getElementById('hwVideo');
  const play=document.getElementById('hwPlay');
  const sound=document.getElementById('hwSound');
  const volume=document.getElementById('hwVolume');
  video.volume=0.7;
  video.muted=true;
  video.controls=false;
  function sync(){
    play.textContent=video.paused?'▶ 再生':'Ⅱ 停止';
    sound.textContent=(video.muted||video.volume===0)?'🔇':'🔊';
    volume.value=String(video.volume);
  }
  play.addEventListener('click',async function(){
    if(video.paused){
      try{await video.play()}catch(error){console.error('[HARF-WAY VIDEO] play error',error)}
    }else{
      video.pause();
    }
    sync();
  });
  sound.addEventListener('click',function(){
    if(video.muted||video.volume===0){
      if(video.volume===0)video.volume=0.5;
      video.muted=false;
    }else{
      video.muted=true;
    }
    sync();
  });
  volume.addEventListener('input',function(){
    const next=Math.max(0,Math.min(1,Number(volume.value)));
    video.volume=next;
    video.muted=next===0;
    sync();
  });
  video.addEventListener('play',sync);
  video.addEventListener('pause',sync);
  video.addEventListener('volumechange',sync);
  sync();
})();
</script></body></html>`;

  res.setHeader('Content-Type', 'text/html; charset=utf-8');
  res.setHeader('Cache-Control', 'public, s-maxage=300, stale-while-revalidate=3600');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Content-Security-Policy', "default-src 'none'; media-src https:; style-src 'unsafe-inline'; script-src 'unsafe-inline'; frame-ancestors *; base-uri 'none'; form-action 'none'");
  return res.status(200).end(html);
}
