(()=>{
  let ready=false;
  let syncing=false;
  let lastLocalSavedAt='';
  let lastServerSavedAt='';
  let syncTimer=0;

  const style=document.createElement('style');
  style.textContent=`
  .weekly-server-save{display:flex;align-items:center;gap:7px;flex-wrap:wrap;margin:8px 0 0}
  .weekly-server-save-pill{display:inline-flex;align-items:center;gap:5px;padding:5px 7px;border:1px solid #4b5660;border-radius:999px;font:900 8px/1 ui-monospace,monospace;letter-spacing:.07em;color:#aeb7c0}
  .weekly-server-save-pill.on{border-color:#6d781f;background:#171d0d;color:#eaff38}
  .weekly-server-save-pill:before{content:'';width:5px;height:5px;border-radius:50%;background:currentColor}
  .weekly-server-save-text{font-size:9px;line-height:1.5;color:#8e99a4}
  `;
  document.head.appendChild(style);

  const host=document.querySelector('.weekly-server-actions')||document.querySelector('.weekly-auto-bar');
  const ui=document.createElement('div');
  ui.className='weekly-server-save';
  ui.innerHTML='<span class="weekly-server-save-pill" id="weeklyServerSavePill">R2 DRAFT</span><span class="weekly-server-save-text" id="weeklyServerSaveText">サーバー保存を確認中…</span>';
  if(host)host.insertAdjacentElement('afterend',ui);
  else document.querySelector('.library')?.prepend(ui);

  const pill=()=>document.getElementById('weeklyServerSavePill');
  const text=()=>document.getElementById('weeklyServerSaveText');
  const stamp=()=>new Intl.DateTimeFormat('ja-JP',{timeZone:'Asia/Tokyo',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(new Date());

  function week(){
    const raw=payload?.range?.start;
    if(!raw)return'';
    const d=new Date(raw);
    if(!Number.isFinite(d.getTime()))return'';
    const parts=new Intl.DateTimeFormat('en-US',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(d);
    const get=t=>parts.find(p=>p.type===t)?.value||'';
    return `${get('year')}-${get('month')}-${get('day')}`;
  }

  function localDraft(){
    try{return JSON.parse(localStorage.getItem(storageKey())||'null')}catch{return null}
  }

  function timeOf(value){
    const t=Date.parse(value||'');
    return Number.isFinite(t)?t:0;
  }

  function applyDraft(draft){
    if(!draft||typeof draft!=='object')return false;
    const custom=Array.isArray(draft.custom)?draft.custom:[];
    const customIds=new Set(custom.map(x=>x?.id).filter(Boolean));
    items=[...custom,...items.filter(x=>!customIds.has(x.id))];
    gameIds=Array.isArray(draft.gameIds)?[...draft.gameIds]:[];
    updateIds=Array.isArray(draft.updateIds)?[...draft.updateIds]:[];
    gameEdit=draft.gameEdit&&typeof draft.gameEdit==='object'?{...draft.gameEdit}:{};
    updateEdit=draft.updateEdit&&typeof draft.updateEdit==='object'?{...draft.updateEdit}:{};
    Object.entries(draft.fields||{}).forEach(([id,value])=>{const el=document.getElementById(id);if(el)el.value=value??''});
    renderAll();
    try{saveLocal()}catch{}
    return true;
  }

  async function getServer(){
    const w=week();
    if(!w)return null;
    const response=await fetch(`/api/weekly-harfway-draft-store?week=${encodeURIComponent(w)}`,{cache:'no-store'});
    const data=await response.json().catch(()=>({}));
    if(!response.ok||!data.ok)throw new Error(data.error||`HTTP ${response.status}`);
    return data;
  }

  async function putServer(draft){
    const w=week();
    if(!w||!draft)return false;
    syncing=true;
    try{
      const response=await fetch(`/api/weekly-harfway-draft-store?week=${encodeURIComponent(w)}`,{
        method:'POST',
        headers:{'content-type':'application/json'},
        body:JSON.stringify({week:w,draft})
      });
      const data=await response.json().catch(()=>({}));
      if(!response.ok||!data.ok)throw new Error(data.error||`HTTP ${response.status}`);
      lastServerSavedAt=data.savedAt||new Date().toISOString();
      const p=pill();if(p)p.classList.add('on');
      const t=text();if(t)t.textContent=`SERVER SAVED ${stamp()} / 週 ${w}`;
      return true;
    }finally{
      syncing=false;
    }
  }

  async function boot(){
    if(ready||!payload)return;
    ready=true;
    const w=week();
    try{
      const local=localDraft();
      const server=await getServer();
      const record=server?.record||null;
      const serverDraft=record?.draft||null;
      lastServerSavedAt=record?.savedAt||'';
      const localTime=timeOf(local?.savedAt);
      const serverTime=timeOf(record?.savedAt||serverDraft?.savedAt);

      if(server?.found&&serverDraft&&serverTime>localTime){
        applyDraft(serverDraft);
        lastLocalSavedAt=localDraft()?.savedAt||serverDraft?.savedAt||'';
        const p=pill();if(p)p.classList.add('on');
        const t=text();if(t)t.textContent=`SERVER RESTORE / ${w} の新しい下書きを復元しました`;
      }else if(local){
        lastLocalSavedAt=local.savedAt||'';
        if(!server?.found||localTime>serverTime){
          await putServer(local);
        }else{
          const p=pill();if(p)p.classList.add('on');
          const t=text();if(t)t.textContent=`SERVER SYNC済み / 週 ${w}`;
        }
      }else{
        const t=text();if(t)t.textContent=`週 ${w} / ローカル下書き作成待ち`;
      }
    }catch(err){
      const t=text();if(t)t.textContent=`SERVER SAVE VERIFY: ${String(err?.message||err)}`;
    }
  }

  function watch(){
    if(!ready||syncing)return;
    const local=localDraft();
    const savedAt=String(local?.savedAt||'');
    if(!local||!savedAt||savedAt===lastLocalSavedAt)return;
    lastLocalSavedAt=savedAt;
    clearTimeout(syncTimer);
    syncTimer=setTimeout(()=>putServer(local).catch(err=>{const t=text();if(t)t.textContent=`SERVER SAVE失敗: ${String(err?.message||err)}`}),700);
  }

  let checks=0;
  const bootTimer=setInterval(()=>{
    checks++;
    if(payload){clearInterval(bootTimer);boot()}
    else if(checks>200){clearInterval(bootTimer);const t=text();if(t)t.textContent='素材取得待ち / SERVER SAVE未開始'}
  },100);
  setInterval(watch,1200);
})();
