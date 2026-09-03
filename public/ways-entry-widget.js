(()=>{
  const API='https://harfway-playback.vercel.app/api/games-live';
  const DEST='https://harfway-playback.vercel.app/';
  const SELECTOR='[data-hw-ways-entry],.hw-ways-entry';
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const waysUrl=(game='')=>{
    const u=new URL(DEST);
    if(game)u.searchParams.set('game',String(game).replace(/^ways-/,''));
    u.searchParams.set('utm_source','harfway');
    u.searchParams.set('utm_medium','site_widget');
    u.searchParams.set('utm_campaign','ways_entry');
    return u.toString();
  };

  function shell(){
    return `
      <style>
        :host{display:block;contain:content;font-family:-apple-system,BlinkMacSystemFont,"Hiragino Kaku Gothic ProN","Hiragino Sans","Yu Gothic",Meiryo,sans-serif;color:#f6f7f2}
        *{box-sizing:border-box}
        a{color:inherit;text-decoration:none}
        .ways-entry{position:relative;overflow:hidden;background:#0a0b0d;border:1px solid #22262b;border-radius:2px;box-shadow:0 16px 38px rgba(0,0,0,.12)}
        .ways-entry:before{content:"";position:absolute;left:0;top:0;width:100%;height:4px;background:#dff238}
        .grid{display:grid;grid-template-columns:minmax(260px,.82fr) minmax(0,1.45fr);min-height:278px}
        .intro{display:flex;flex-direction:column;justify-content:space-between;padding:30px 28px 26px;border-right:1px solid #252930}
        .eyebrow{display:flex;align-items:center;gap:9px;font-size:10px;font-weight:900;letter-spacing:.14em;color:#dff238}
        .eyebrow:before{content:"";width:28px;height:1px;background:#dff238}
        h2{margin:17px 0 10px;font-size:clamp(24px,3vw,38px);line-height:1.13;letter-spacing:-.045em;font-weight:900}
        .lead{margin:0;color:#a9adb2;font-size:12px;line-height:1.75;max-width:34em}
        .cta{display:flex;align-items:center;justify-content:space-between;gap:18px;margin-top:24px;padding:13px 14px;border:1px solid #565c63;background:#111317;font-size:12px;font-weight:900;letter-spacing:.03em;transition:.16s ease}
        .cta:hover{border-color:#dff238;color:#dff238;transform:translateY(-1px)}
        .cta strong{font-size:15px}
        .feed{position:relative;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:1px;background:#262a30;min-width:0}
        .game{position:relative;display:flex;min-width:0;min-height:278px;background:#111317;overflow:hidden;isolation:isolate}
        .game img{position:absolute;inset:0;width:100%;height:100%;object-fit:cover;filter:saturate(.82) brightness(.72);transition:transform .3s ease,filter .3s ease}
        .game:after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,.04) 22%,rgba(0,0,0,.2) 48%,rgba(4,5,6,.95) 100%);z-index:1}
        .game:hover img{transform:scale(1.035);filter:saturate(1) brightness(.83)}
        .game:hover .play{background:#dff238;color:#10120c;border-color:#dff238}
        .fallback{position:absolute;inset:0;background:linear-gradient(135deg,#15191d,#08090b)}
        .game-body{position:relative;z-index:2;align-self:flex-end;width:100%;padding:16px 15px 15px}
        .play{display:grid;place-items:center;width:34px;height:34px;margin-bottom:12px;border:1px solid rgba(255,255,255,.58);border-radius:999px;background:rgba(8,9,11,.55);font-size:12px;transition:.16s ease}
        .game small{display:block;margin-bottom:6px;color:#dff238;font-size:8px;font-weight:900;letter-spacing:.12em}
        .game b{display:-webkit-box;overflow:hidden;-webkit-line-clamp:2;-webkit-box-orient:vertical;font-size:13px;line-height:1.35}
        .loading .game-body{opacity:.45}
        .loading .fallback{background:linear-gradient(110deg,#111419 8%,#1b1f25 18%,#111419 33%);background-size:200% 100%;animation:shimmer 1.25s linear infinite}
        @keyframes shimmer{to{background-position:-200% 0}}
        @media(max-width:760px){
          .grid{grid-template-columns:1fr;min-height:0}
          .intro{padding:24px 20px 20px;border-right:0;border-bottom:1px solid #252930}
          h2{font-size:29px;max-width:12em}
          .lead{font-size:12px}
          .cta{margin-top:18px}
          .feed{display:flex;overflow-x:auto;scroll-snap-type:x mandatory;scrollbar-width:none;background:#0a0b0d;gap:1px}
          .feed::-webkit-scrollbar{display:none}
          .game{flex:0 0 72%;min-height:225px;scroll-snap-align:start;border-right:1px solid #252930}
        }
        @media(max-width:430px){.game{flex-basis:82%}.intro{padding:22px 17px 18px}}
      </style>
      <section class="ways-entry" aria-label="WAYSへの案内">
        <div class="grid">
          <div class="intro">
            <div>
              <div class="eyebrow">HARF-WAY / WAYS</div>
              <h2>動画から、<br>次の一本に寄り道する。</h2>
              <p class="lead">短いプレイ映像を流し見しながら、知らなかったゲームと出会う場所。気になった一本から、そのまま奥へ。</p>
            </div>
            <a class="cta" href="${waysUrl()}" aria-label="WAYSでゲームを眺める"><span>30秒からゲームを眺める</span><strong>→</strong></a>
          </div>
          <div class="feed loading" aria-live="polite">
            ${[0,1,2].map(()=>`<span class="game"><span class="fallback"></span><span class="game-body"><span class="play">▶</span><small>PLAY / WAYS</small><b>ゲームを読み込み中…</b></span></span>`).join('')}
          </div>
        </div>
      </section>`;
  }

  function renderGames(root,entries){
    const feed=root.querySelector('.feed');
    if(!feed)return;
    const games=(Array.isArray(entries)?entries:[]).filter(x=>x&&x.id&&x.title).slice(0,3);
    if(!games.length){
      feed.classList.remove('loading');
      feed.innerHTML=`<a class="game" href="${waysUrl()}"><span class="fallback"></span><span class="game-body"><span class="play">▶</span><small>PLAY / WAYS</small><b>WAYSでゲームを眺める</b></span></a>`;
      return;
    }
    feed.classList.remove('loading');
    feed.innerHTML=games.map(g=>{
      const thumb=String(g.thumbnailUrl||'').trim();
      const media=thumb?`<img src="${esc(thumb)}" alt="" loading="lazy" decoding="async">`:'<span class="fallback"></span>';
      return `<a class="game" href="${waysUrl(g.id)}" aria-label="${esc(g.title)}をWAYSで見る">${media}<span class="game-body"><span class="play">▶</span><small>PLAY / WAYS</small><b>${esc(g.title)}</b></span></a>`;
    }).join('');
  }

  async function mount(host){
    if(host.dataset.hwWaysMounted==='1')return;
    host.dataset.hwWaysMounted='1';
    const root=host.shadowRoot||host.attachShadow?.({mode:'open'})||host;
    root.innerHTML=shell();
    try{
      const r=await fetch(API,{cache:'no-store',headers:{accept:'application/json'}});
      const data=await r.json();
      renderGames(root,r.ok&&data?.ok?data.entries:[]);
    }catch{renderGames(root,[])}
  }

  function boot(){document.querySelectorAll(SELECTOR).forEach(mount)}
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',boot,{once:true});else boot();
})();
