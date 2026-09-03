(()=>{
  const $=s=>document.querySelector(s);
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const n=v=>Number(v||0).toLocaleString('ja-JP');
  let running=false;

  function serviceCard(key,s){
    const name=String(s?.label||key||'').toUpperCase();
    const collect=!!s?.collection?.enabled;
    const report=!!s?.reportingConnected;
    const period=s?.period==='all_time'?'ALL TIME':s?.period?.replace('last_','LAST ').replace('_days',' DAYS')||(collect?'GA4 COLLECTION':'OFF');
    let metric='GA4 LIVE',label=s?.collection?.contentType||'';
    if(key==='ways'&&report){metric=n(s.summary?.gameViews);label='作品表示'}
    else if(key==='showcase'&&s?.deepReportingConnected){metric=n(s.summary?.gameViews);label='作品表示 / DETAIL'}
    else if(report){metric=n(s.summary?.pageViews);label=`PV / ACTIVE USERS ${n(s.summary?.activeUsers)}`}
    const auto=s?.autoSynced?'<span class="badge live">AUTO SYNC</span>':'';
    return `<div class="service ${collect?'live':''}"><div class="name"><i class="dot"></i>${esc(name)}</div><div class="period">${esc(period)}</div><b>${metric}</b><small>${esc(label)}</small><div class="badges"><span class="badge ${collect?'live':'wait'}">${collect?'COLLECTION LIVE':'COLLECTION OFF'}</span><span class="badge ${report?'data':'wait'}">${report?'HUB DATA':'REPORTING WAIT'}</span>${auto}${key==='showcase'&&!s?.deepReportingConnected?'<span class="badge wait">DETAIL KEY</span>':''}</div></div>`;
  }

  function renderWaysTraffic(d){
    const ways=d?.services?.ways||{};
    const ga4=ways?.ga4Summary||d?.ga4?.services?.ways||null;
    const kpis=document.querySelector('.kpis');
    if(!kpis||!ga4)return;

    if(!document.querySelector('#waysTrafficStyle')){
      const style=document.createElement('style');
      style.id='waysTrafficStyle';
      style.textContent=`
        .ways-traffic{margin:0 0 18px;padding:17px;background:var(--panel);border:1px solid var(--line);border-radius:16px}
        .ways-traffic-head{display:flex;align-items:end;justify-content:space-between;gap:12px;margin-bottom:12px}
        .ways-traffic-head h2{margin:0;font-size:13px;letter-spacing:.1em}
        .ways-traffic-head p{margin:0;color:var(--muted);font-size:10px}
        .ways-traffic-grid{display:grid;grid-template-columns:repeat(3,1fr);gap:9px}
        .ways-traffic-card{background:var(--panel2);border:1px solid var(--line);border-radius:12px;padding:14px}
        .ways-traffic-card small{display:block;color:var(--muted);font-size:10px;letter-spacing:.08em}
        .ways-traffic-card b{display:block;margin-top:7px;font-size:31px;letter-spacing:-.04em}
        .ways-traffic-card i{display:block;margin-top:4px;color:var(--muted);font-style:normal;font-size:10px}
        @media(max-width:700px){.ways-traffic-grid{grid-template-columns:1fr}.ways-traffic-head{align-items:flex-start;flex-direction:column}}
      `;
      document.head.append(style);
    }

    let root=document.querySelector('#waysTraffic');
    if(!root){
      root=document.createElement('section');
      root.id='waysTraffic';
      root.className='ways-traffic';
      kpis.insertAdjacentElement('afterend',root);
    }

    const users=Number(ga4.activeUsers||0);
    const sessions=Number(ga4.sessions||0);
    const pageViews=Number(ga4.pageViews||0);
    const sessionsPerUser=users?sessions/users:0;
    const pvPerSession=sessions?pageViews/sessions:0;
    root.innerHTML=`
      <div class="ways-traffic-head">
        <h2>WAYS TRAFFIC / GA4</h2>
        <p>UUはGA4のActive Usersを表示</p>
      </div>
      <div class="ways-traffic-grid">
        <div class="ways-traffic-card"><small>UU / ACTIVE USERS</small><b>${n(users)}</b><i>何人来たかの目安</i></div>
        <div class="ways-traffic-card"><small>SESSIONS</small><b>${n(sessions)}</b><i>1UUあたり ${sessionsPerUser.toFixed(2)} 訪問</i></div>
        <div class="ways-traffic-card"><small>PV</small><b>${n(pageViews)}</b><i>1セッションあたり ${pvPerSession.toFixed(2)} PV</i></div>
      </div>`;
  }

  async function refresh(){
    if(running)return;
    running=true;
    try{
      const days=$('#days')?.value||'7';
      const key=$('#key')?.value?.trim()||'';
      const headers=key?{'x-showcase-admin-key':key}:{};
      const r=await fetch(`/api/harfway-analytics?days=${encodeURIComponent(days)}`,{cache:'no-store',headers});
      const d=await r.json();
      if(!r.ok||!d?.ok)return;
      const entries=Object.entries(d.services||{});
      const root=$('#services');
      if(root){
        root.style.gridTemplateColumns='repeat(auto-fit,minmax(180px,1fr))';
        root.innerHTML=entries.map(([name,s])=>serviceCard(name,s)).join('');
      }
      renderWaysTraffic(d);
      const collect=entries.filter(([,s])=>s?.collection?.enabled).length;
      const reporting=entries.filter(([,s])=>s?.reportingConnected).length;
      if($('#collectionCount'))$('#collectionCount').textContent=`${collect} / ${entries.length}`;
      if($('#reportCount'))$('#reportCount').textContent=`${reporting} / ${entries.length}`;
      if($('#ga4id'))$('#ga4id').textContent=d?.ga4?.measurementId||'—';
      const liveBadge=document.querySelector('.ga4id .badges');
      if(liveBadge)liveBadge.innerHTML=`<span class="badge live">${entries.length} SERVICES LIVE</span>${d?.registry?.autoAdded?`<span class="badge live">+${d.registry.autoAdded} AUTO</span>`:''}`;
      const coverage=document.querySelector('#services')?.closest('.panel')?.querySelector('h2');
      if(coverage&&!coverage.querySelector('[data-auto-sync]'))coverage.insertAdjacentHTML('beforeend',' <span data-auto-sync class="badge live" style="margin-left:8px">AUTO SYNC</span>');
      const hero=document.querySelector('.hero p');
      if(hero)hero.textContent=`HARF-WAY全体を「計測する層」と「分析画面へ集約する層」に分けて管理。現在${entries.length}サービスを共通GA4で集約し、新しいHARF-WAYツールはmanifestからAnalyticsへ自動同期します。`;
      const version=document.querySelector('.brand span');
      if(version)version.textContent='v0.5';
      const foot=document.querySelector('.foot');
      if(foot)foot.textContent=`Analytics v0.5 — WAYS UU / Sessions / PVをGA4で表示。Collection ${collect}/${entries.length} / AUTO SYNC ${d?.registry?.autoAdded||0}。`;
      window.HW_ANALYTICS_AUTO_SYNC={ok:true,registry:d.registry,services:entries.length,refreshedAt:new Date().toISOString()};
    }catch(error){
      console.warn('[analytics-auto-sync]',error);
      window.HW_ANALYTICS_AUTO_SYNC={ok:false,error:String(error?.message||error)};
    }finally{running=false}
  }

  window.addEventListener('DOMContentLoaded',()=>{
    setTimeout(refresh,500);
    $('#load')?.addEventListener('click',()=>setTimeout(refresh,350));
    $('#days')?.addEventListener('change',()=>setTimeout(refresh,350));
  });
})();
