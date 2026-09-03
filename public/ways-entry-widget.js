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
        button{font:inherit}
        .ways-entry{position:relative;overflow:hidden;background:#0a0b0d;border:1px solid #22262b;border-radius:2px;box-shadow:0 16px 38px rgba(0,0,0,.12)}
        .ways-entry:before{content:"";position:absolute;left:0;top:0;width:100%;height:4px;background:#dff238;z-index:9}
        .grid{display:grid;grid-template-columns:minmax(260px,.82fr) minmax(0,1.45fr);min-height:292px}
        .intro{display:flex;flex-direction:column;justify-content:space-between;padding:30px 28px 26px;border-right:1px solid #252930}
        .eyebrow{display:flex;align-items:center;gap:9px;font-size:10px;font-weight:900;letter-spacing:.14em;color:#dff238}
        .eyebrow:before{content:"";width:28px;height:1px;background:#dff238}
        h2{margin:17px 0 10px;font-size:clamp(24px,3vw,38px);line-height:1.13;letter-spacing:-.045em;font-weight:900}
        .lead{margin:0;color:#a9adb2;font-size:12px;line-height:1.75;max-width:34em}
        .hint{display:block;margin-top:11px;color:#6f747a;font-size:9px;line-height:1.5}
        .cta{display:flex;align-items:center;justify-content:space-between;gap:18px;margin-top:24px;padding:13px 14px;border:1px solid #565c63;background:#111317;font-size:12px;font-weight:900;letter-spacing:.03em;transition:.16s ease}
        .cta:hover{border-color:#dff238;color:#dff238;transform:translateY(-1px)}
        .cta strong{font-size:15px}
        .feed{position:relative;display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:1px;background:#262a30;min-width:0}
        .game{position:relative;display:flex;min-width:0;min-height:292px;background:#111317;overflow:hidden;isolation:isolate}
        .game video,.game .poster{position:absolute;inset:0;width:100%;height:100%;object-fit:cover}
        .game video{z-index:0;background:#050607}
        .game .poster{z-index:1;filter:saturate(.82) brightness(.72);transition:opacity .18s ease,transform .3s ease,filter .3s ease}
        .game.is-playing .poster{opacity:0;pointer-events:none}
        .game:after{content:"";position:absolute;inset:0;background:linear-gradient(180deg,rgba(0,0,0,.04) 18%,rgba(0,0,0,.08) 47%,rgba(4,5,6,.92) 100%);z-index:2;pointer-events:none}
        .game:hover .poster{transform:scale(1.035);filter:saturate(1) brightness(.83)}
        .fallback{position:absolute;inset:0;background:linear-gradient(135deg,#15191d,#08090b);z-index:0}
        .play-toggle{position:absolute;z-index:4;left:14px;top:15px;display:grid;place-items:center;width:39px;height:39px;border:1px solid rgba(255,255,255,.65);border-radius:999px;background:rgba(8,9,11,.7);color:#fff;font-size:13px;font-weight:900;cursor:pointer;transition:.16s ease}
        .game:hover .play-toggle,.play-toggle:hover{background:#dff238;color:#10120c;border-color:#dff238}
        .game.is-playing .play-toggle{opacity:.2}
        .game.is-playing:hover .play-toggle,.game.is-playing .play-toggle:focus-visible{opacity:1}
        .sound{position:absolute;z-index:4;right:12px;top:15px;display:none;place-items:center;width:34px;height:34px;border:1px solid rgba(255,255,255,.48);border-radius:999px;background:rgba(8,9,11,.7);color:#fff;cursor:pointer}
        .game.is-playing .sound{display:grid}
        .game-body{position:relative;z-index:3;align-self:flex-end;width:100%;padding:18px 15px 15px;pointer-events:none}
        .game small{display:block;margin-bottom:6px;color:#dff238;font-size:8px;font-weight:900;letter-spacing:.12em}
        .game b{display:-webkit-box;overflow:hidden;-webkit-line-clamp:2;-webkit-box-orient:vertical;font-size:13px;line-height:1.35}
        .to-ways{display:inline-flex;align-items:center;gap:6px;margin-top:10px;padding:7px 9px;border:1px solid rgba(255,255,255,.3);background:rgba(8,9,11,.5);font-size:9px;font-weight:900;pointer-events:auto;transition:.15s ease}
        .to-ways:hover{border-color:#dff238;color:#dff238}
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
          .game{flex:0 0 72%;min-height:245px;scroll-snap-align:start;border-right:1px solid #252930}
        }
        @media(max-width:430px){.game{flex-basis:82%}.intro{padding:22px 17px 18px}}
      </style>
      <section class="ways-entry" aria-label="WAYSへの案内">
        <div class="grid">
          <div class="intro">
            <div>
              <div class="eyebrow">HARF-WAY / WAYS</div>
              <h2>動画から、<br>次の一本に寄り道する。</h2>
              <p class="lead">短いプレイ映像をその場で眺めながら、知らなかったゲームと出会う場所。もっと見たくなった一本からWAYSへ。</p>
              <span class="hint">▶ を押すと動画を読み込みます。最初はミュート再生です。</span>
            </div>
            <a class="cta" href="${waysUrl()}" aria-label="WAYSでゲームを眺める"><span>もっと動画を眺める</span><strong>→</strong></a>
          </div>
          <div class="feed loading" aria-live="polite">
            ${[0,1,2].map(()=>`<span class="game"><span class="fallback"></span><span class="game-body"><small>PLAY / WAYS</small><b>ゲームを読み込み中…</b></span></span>`).join('')}
          </div>
        </div>
      </section>`;
  }

  function setupVideos(root){
    const cards=[...root.querySelectorAll('.game[data-video]')];
    const stopOthers=active=>cards.forEach(card=>{
      if(card===active)return;
      const v=card.querySelector('video');
      if(v&&!v.paused){v.pause();v.currentTime=0}
      card.classList.remove('is-playing');
      const b=card.querySelector('.play-toggle');
      if(b){b.textContent='▶';b.setAttribute('aria-label','動画を再生')}
    });
    cards.forEach(card=>{
      const video=card.querySelector('video');
      const play=card.querySelector('.play-toggle');
      const sound=card.querySelector('.sound');
      if(!video||!play)return;
      const ensureSrc=()=>{if(!video.getAttribute('src')){video.src=card.dataset.video;video.load()}};
      const toggle=async()=>{
        if(video.paused){
          stopOthers(card);
          ensureSrc();
          video.muted=true;
          try{await video.play()}catch{return}
        }else video.pause();
      };
      play.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();toggle()});
      video.addEventListener('click',toggle);
      video.addEventListener('play',()=>{card.classList.add('is-playing');play.textContent='Ⅱ';play.setAttribute('aria-label','動画を一時停止')});
      video.addEventListener('pause',()=>{card.classList.remove('is-playing');play.textContent='▶';play.setAttribute('aria-label','動画を再生')});
      sound?.addEventListener('click',e=>{e.preventDefault();e.stopPropagation();video.muted=!video.muted;sound.textContent=video.muted?'🔇':'🔊';sound.setAttribute('aria-label',video.muted?'音を出す':'ミュートにする')});
    });
  }

  function renderGames(root,entries){
    const feed=root.querySelector('.feed');
    if(!feed)return;
    const games=(Array.isArray(entries)?entries:[]).filter(x=>x&&x.id&&x.title&&x.video).slice(0,3);
    if(!games.length){
      feed.classList.remove('loading');
      feed.innerHTML=`<a class="game" href="${waysUrl()}"><span class="fallback"></span><span class="game-body"><small>PLAY / WAYS</small><b>WAYSでゲームを眺める</b></span></a>`;
      return;
    }
    feed.classList.remove('loading');
    feed.innerHTML=games.map(g=>{
      const thumb=String(g.thumbnailUrl||'').trim();
      const poster=thumb?`<img class="poster" src="${esc(thumb)}" alt="" loading="lazy" decoding="async">`:'<span class="fallback poster"></span>';
      return `<article class="game" data-video="${esc(g.video)}">${poster}<video playsinline muted loop preload="none" aria-label="${esc(g.title)}のプレイ動画"></video><button class="play-toggle" type="button" aria-label="動画を再生">▶</button><button class="sound" type="button" aria-label="音を出す">🔇</button><span class="game-body"><small>PLAY / WAYS</small><b>${esc(g.title)}</b><a class="to-ways" href="${waysUrl(g.id)}" aria-label="${esc(g.title)}をWAYSで詳しく見る">WAYSで続きを見る →</a></span></article>`;
    }).join('');
    setupVideos(root);
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
