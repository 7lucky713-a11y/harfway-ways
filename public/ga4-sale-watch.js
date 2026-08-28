(()=>{
  const ID='G-LQVHR07K15';
  const SERVICE='sale-watch';
  const CONTENT='public_sale_tool';
  const PROD_HOSTS=new Set(['harfway-playback.vercel.app','harfway-playback-harf-way.vercel.app']);
  const qs=new URLSearchParams(location.search);
  const debug=qs.get('ga_debug')==='1';
  const production=PROD_HOSTS.has(location.hostname);
  const enabled=production||debug;
  const eventMap={page_view:'page_view',search:'sale_search',filter_change:'sale_filter',content_click:'content_click',store_click:'store_click'};

  function load(){
    if(!enabled||window.__hwSaleWatchGa4Loaded)return;
    window.__hwSaleWatchGa4Loaded=true;
    window.dataLayer=window.dataLayer||[];
    window.gtag=window.gtag||function(){dataLayer.push(arguments)};
    gtag('js',new Date());
    gtag('config',ID,{send_page_view:false,debug_mode:debug||undefined});
    const script=document.createElement('script');
    script.async=true;
    script.src='https://www.googletagmanager.com/gtag/js?id='+encodeURIComponent(ID);
    document.head.appendChild(script);
  }

  function send(name,payload={}){
    if(!enabled)return;
    const eventName=eventMap[name]||name;
    const meta=payload.metadata&&typeof payload.metadata==='object'?payload.metadata:{};
    load();
    gtag('event',eventName,{
      service_name:SERVICE,
      content_type:CONTENT,
      environment:production?'production':'preview',
      debug_mode:debug||undefined,
      page_name:String(payload.page||SERVICE),
      page_path:location.pathname,
      game_id:String(payload.gameId||''),
      game_title:String(meta.title||''),
      source_name:String(payload.source||meta.kind||''),
      content_kind:String(meta.kind||''),
      search_term:String(meta.query||''),
      source_filter:String(meta.source_filter||''),
      price_filter:String(meta.price_filter||''),
      sort_order:String(meta.sort||''),
      result_count:Number(meta.result_count||0)||0,
      link_url:String(meta.href||''),
      selection_via:String(meta.via||''),
      page_referrer:String(meta.referrer||document.referrer||'')
    });
  }

  if(enabled){
    const originalFetch=window.fetch.bind(window);
    window.fetch=async function(input,init={}){
      try{
        const url=typeof input==='string'?input:input?.url||'';
        if((url==='/api/track'||url.endsWith('/api/track'))&&String(init?.method||'GET').toUpperCase()==='POST'&&typeof init?.body==='string'){
          const payload=JSON.parse(init.body);
          if(payload?.page==='sale-watch'&&eventMap[payload.event])send(payload.event,payload);
        }
      }catch{}
      return originalFetch(input,init);
    };
  }

  window.HW_SALE_WATCH_GA4={enabled,debug,production,service:SERVICE,contentType:CONTENT,measurementId:ID,send};
})();
