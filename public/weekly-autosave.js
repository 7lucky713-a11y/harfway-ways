(()=>{
  const FIELD_IDS=['weekLabel','jpWeekLabel','gameHeading','gameLead','weekdayCount','gameCount','thirdStat','boardHeading','boardLead','updateCount','arrivalCount','boardFoot','boardTags','memo','memoLinkLabel','memoLink'];
  let ready=false;
  let saveTimer=0;
  let lastSavedAt='';

  const style=document.createElement('style');
  style.textContent=`
  .weekly-auto-bar{display:flex;align-items:center;gap:8px;flex-wrap:wrap;margin:0 0 12px;padding:9px 10px;border:1px solid #33404a;border-radius:10px;background:#0b0f13}
  .weekly-auto-pill{display:inline-flex;align-items:center;gap:6px;padding:5px 7px;border:1px solid #4a5661;border-radius:999px;font:900 8px/1 ui-monospace,monospace;letter-spacing:.08em;color:#aeb8c1}
  .weekly-auto-pill.on{border-color:#6e791d;color:#eaff38;background:#171d0d}
  .weekly-auto-pill:before{content:'';width:5px;height:5px;border-radius:50%;background:currentColor}
  .weekly-auto-text{font-size:9px;color:#8e99a4;line-height:1.4}
  `;
  document.head.appendChild(style);

  const saveStatus=document.getElementById('saveStatus');
  const bar=document.createElement('div');
  bar.className='weekly-auto-bar';
  bar.innerHTML='<span class="weekly-auto-pill on">AUTO SAVE ON</span><span class="weekly-auto-pill" id="weeklyDraftMode">WEEK DRAFT</span><span class="weekly-auto-text" id="weeklyAutoText">週データを確認中…</span>';
  if(saveStatus?.parentElement)saveStatus.parentElement.insertBefore(bar,saveStatus);
  else document.querySelector('.editor')?.prepend(bar);

  const autoText=()=>document.getElementById('weeklyAutoText');
  const modePill=()=>document.getElementById('weeklyDraftMode');
  const stamp=()=>new Intl.DateTimeFormat('ja-JP',{timeZone:'Asia/Tokyo',hour:'2-digit',minute:'2-digit',second:'2-digit',hour12:false}).format(new Date());

  function snapshot(){
    if(!ready||!payload)return false;
    try{
      normalizeSections?.();
      const fields=Object.fromEntries(FIELD_IDS.map(id=>[id,document.getElementById(id)?.value??'']));
      const data={
        gameIds:[...gameIds],
        updateIds:[...updateIds],
        gameEdit:{...gameEdit},
        updateEdit:{...updateEdit},
        fields,
        custom:items.filter(x=>x.type==='CUSTOM'),
        savedAt:new Date().toISOString(),
        autosave:true
      };
      localStorage.setItem(storageKey(),JSON.stringify(data));
      lastSavedAt=stamp();
      const el=autoText();if(el)el.textContent=`保存済み ${lastSavedAt} / このブラウザに自動保存`;
      return true;
    }catch(err){
      const el=autoText();if(el)el.textContent=`自動保存に失敗: ${String(err?.message||err)}`;
      return false;
    }
  }

  function scheduleSave(delay=450){
    if(!ready)return;
    clearTimeout(saveTimer);
    saveTimer=setTimeout(snapshot,delay);
  }

  const baseRenderAll=renderAll;
  renderAll=function(){
    const out=baseRenderAll();
    scheduleSave(220);
    return out;
  };

  document.addEventListener('input',()=>scheduleSave(550),true);
  document.addEventListener('change',()=>scheduleSave(280),true);
  document.addEventListener('click',e=>{
    if(e.target.closest('button,[data-toggle],[data-xnews],[data-gup],[data-gdown],[data-gremove],[data-uup],[data-udown],[data-uremove]'))scheduleSave(320);
  },true);
  window.addEventListener('beforeunload',()=>{if(ready)snapshot()});

  const manualSave=document.getElementById('save');
  if(manualSave)manualSave.addEventListener('click',()=>setTimeout(()=>{snapshot();const el=autoText();if(el)el.textContent=`手動保存 + 自動保存 ${lastSavedAt||stamp()}`},0));

  let checks=0;
  const boot=setInterval(()=>{
    checks++;
    if(!payload){if(checks>200){clearInterval(boot);const el=autoText();if(el)el.textContent='素材取得待ち';}return}
    clearInterval(boot);
    let hasDraft=false;
    try{hasDraft=!!localStorage.getItem(storageKey())}catch{}
    ready=true;
    if(hasDraft){
      const pill=modePill();if(pill){pill.textContent='CONTINUE';pill.classList.add('on')}
      const el=autoText();if(el)el.textContent='この週の保存済み下書きを復元しました';
      scheduleSave(700);
      return;
    }
    const pill=modePill();if(pill){pill.textContent='NEW WEEK AUTO';pill.classList.add('on')}
    const el=autoText();if(el)el.textContent='新しい週を検出。初回下書きを作成中…';
    setTimeout(()=>{
      try{
        autoFill();
        snapshot();
        const txt=autoText();if(txt)txt.textContent=`新しい週の下書きを自動作成・保存しました ${lastSavedAt}`;
      }catch(err){
        const txt=autoText();if(txt)txt.textContent=`自動下書き作成に失敗: ${String(err?.message||err)}`;
      }
    },180);
  },100);
})();