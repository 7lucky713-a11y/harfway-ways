(()=>{
  const ID='G-LQVHR07K15';
  const SERVICE='ways';
  const CONTENT='public_discovery';
  const PROD_HOSTS=new Set(['harfway-playback.vercel.app','harfway-playback-harf-way.vercel.app']);
  const qs=new URLSearchParams(location.search);
  const debug=qs.get('ga_debug')==='1';
  const enabled=PROD_HOSTS.has(location.hostname)||debug;
  const mapEvent={page_view:'page_view',view:'game_view',select:'game_select',play:'video_start',p25:'video_25',p50:'video_50',p75:'video_75',complete:'video_complete',view_end:'video_view_end',store_click:'store_click',article_click:'article_click',tag_click:'tag_click'};
  const base=()=>({service_name:SERVICE,content_type:CONTENT,environment:PROD_HOSTS.has(location.hostname)?'production':'preview',debug_mode:debug||undefined});
  function load(){if(!enabled||window.__hwGa4Loaded)return;window.__hwGa4Loaded=true;window.dataLayer=window.dataLayer||[];window.gtag=window.gtag||function(){dataLayer.push(arguments)};gtag('js',new Date());gtag('config',ID,{send_page_view:false,debug_mode:debug||undefined});const s=document.createElement('script');s.async=true;s.src='https://www.googletagmanager.com/gtag/js?id='+encodeURIComponent(ID);document.head.appendChild(s)}
  function track(name,params={}){if(!enabled)return;load();gtag('event',mapEvent[name]||name,{...base(),...params});}
  function mirrorPayload(p){if(!p||!p.event)return;const meta=p.metadata&&typeof p.metadata==='object'?p.metadata:{};track(p.event,{game_id:String(p.gameId||''),game_title:String(meta.title||''),page_name:String(p.page||''),device_type:String(p.device||''),source_name:String(p.source||''),progress_percent:Number(p.progress||0)||0,video_duration:Number(p.duration||0)||0,tag_name:String(meta.tag||''),selection_via:String(meta.via||'')});}
  if(enabled){const originalFetch=window.fetch.bind(window);window.fetch=async function(input,init={}){try{const url=typeof input==='string'?input:input?.url||'';if((url==='/api/track'||url.endsWith('/api/track'))&&String(init?.method||'GET').toUpperCase()==='POST'&&typeof init?.body==='string'){mirrorPayload(JSON.parse(init.body));}}catch{}return originalFetch(input,init)};}
  window.HWGA4={enabled,debug,service:SERVICE,measurementId:ID,track,mapEvent};
  if(enabled)track('page_view',{page_title:document.title,page_location:location.href,page_path:location.pathname});
})();
