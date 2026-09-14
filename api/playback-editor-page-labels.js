import baseHandler from './playback-editor-page.js';

const LABEL_PREFIX = '__ways_label:';
const TYPE_PREFIX = '__ways_type:';

const LABEL_STYLE = `
<style id="ways-label-style">
.ways-label-panel{margin:10px 0 0;padding:14px;border:1px solid #30343a;border-radius:12px;background:#0d0f11}
.ways-label-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:10px}
.ways-label-head strong{display:block;font-size:12px}.ways-label-head small{display:block;margin-top:3px;color:#8f939b;font-size:10px;line-height:1.45}
.ways-label-head-actions{display:flex;align-items:center;gap:7px}.ways-label-count{display:inline-flex;align-items:center;border:1px solid #3b3e45;color:#9da1a9;border-radius:999px;padding:4px 7px;font-size:9px;font-weight:900;white-space:nowrap}
.ways-label-manage{border:1px solid #48501d;color:var(--a);border-radius:999px;padding:5px 8px;font-size:9px;font-weight:900;text-decoration:none;white-space:nowrap}
.ways-label-chips{display:flex;flex-wrap:wrap;gap:7px;min-height:28px}
.ways-label-chip{border:1px solid #3b3e45;background:#111317;color:#aeb2ba;border-radius:999px;padding:7px 9px;font-size:10px;font-weight:850;cursor:pointer}
.ways-label-chip:hover{border-color:var(--a);color:var(--a)}.ways-label-chip.on{border-color:var(--a);background:var(--a);color:#111}
.ways-label-empty{color:#666b73;font-size:10px;padding:7px 0}
.ways-label-add{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:8px;margin-top:10px}
.ways-label-add input{min-width:0;border:1px solid #3b3e45;background:#070809;color:#f3f3ef;border-radius:9px;padding:9px 10px;font-size:11px;outline:none}
.ways-label-add input:focus{border-color:var(--a)}.ways-label-add button{border:1px solid var(--a);background:var(--a);color:#111;border-radius:9px;padding:9px 12px;font-size:10px;font-weight:950;cursor:pointer}
@media(max-width:700px){.ways-label-panel{padding:12px}.ways-label-add{grid-template-columns:1fr}.ways-label-add button{width:100%}.ways-label-head{display:block}.ways-label-head-actions{margin-top:9px}}
</style>`;

const LABEL_SCRIPT = `
<script id="ways-label-script">
(()=>{
  const LABEL_PREFIX='${LABEL_PREFIX}';
  const TYPE_PREFIX='${TYPE_PREFIX}';
  const CATALOG_API='/api/ways-labels';
  let catalog=[];
  const current=()=>window.__peCur?.()||null;
  const state=()=>window.__peState?.()||{games:[]};
  const esc=s=>String(s??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const unique=list=>[...new Set(list.map(v=>String(v||'').trim()).filter(Boolean))];
  const isLabelMarker=t=>String(t||'').toLowerCase().startsWith(LABEL_PREFIX);
  const decodeLabel=t=>{const raw=String(t||'').slice(LABEL_PREFIX.length);try{return decodeURIComponent(raw)}catch{return raw}};
  const rawLabelsOf=g=>unique([
    ...(Array.isArray(g?.labels)?g.labels:[]),
    ...(Array.isArray(g?.tags)?g.tags.filter(isLabelMarker).map(decodeLabel):[])
  ]);
  const rawAllLabels=()=>unique((Array.isArray(state()?.games)?state().games:[]).flatMap(rawLabelsOf));
  function definitions(){
    const byKey=new Map(catalog.map(x=>[x.key,x]));
    for(const key of rawAllLabels())if(!byKey.has(key))byKey.set(key,{key,name:key,description:'',count:0,managed:false});
    return [...byKey.values()];
  }
  function setLabels(g,labels){
    if(!g)return;
    const kept=(Array.isArray(g.tags)?g.tags:[]).filter(t=>!isLabelMarker(t));
    const next=unique(labels).slice(0,24);
    g.tags=[...kept,...next.map(key=>LABEL_PREFIX+encodeURIComponent(key))];
    g.labels=next;
  }
  function markDirty(){
    const input=document.querySelector('#editor [data-k="description"]');
    if(input)input.dispatchEvent(new Event('input',{bubbles:true}));
  }
  function toggleLabel(key){
    const g=current();if(!g)return;
    const cur=rawLabelsOf(g);const has=cur.includes(key);
    setLabels(g,has?cur.filter(x=>x!==key):[...cur,key]);
    markDirty();refresh();
  }
  function addLabel(box){
    const input=box?.querySelector('[data-ways-label-input]');if(!input)return;
    const name=String(input.value||'').trim().replace(/\\s+/g,' ').slice(0,40);if(!name)return;
    const g=current();if(!g)return;
    if(!catalog.some(x=>x.key===name))catalog.push({key:name,name,description:'',count:0,managed:false});
    setLabels(g,[...rawLabelsOf(g),name]);input.value='';markDirty();refresh();
  }
  function makePanel(){
    const box=document.createElement('section');box.className='ways-label-panel';
    box.innerHTML='<div class="ways-label-head"><div><strong>LABEL</strong><small>テーマ別の特化コーナー。複数選択できます。</small></div><div class="ways-label-head-actions"><span class="ways-label-count">0 LABELS</span><a class="ways-label-manage" href="/ways-labels-admin/" target="_top">LABEL管理 ↗</a></div></div><div class="ways-label-chips"></div><div class="ways-label-add"><input type="text" maxlength="40" data-ways-label-input placeholder="新しいLABEL名"><button type="button" data-ways-label-add>＋ LABELを追加</button></div>';
    box.addEventListener('click',e=>{const chip=e.target.closest('[data-ways-label]');if(chip){toggleLabel(decodeURIComponent(chip.dataset.waysLabel||''));return}if(e.target.closest('[data-ways-label-add]'))addLabel(box)});
    box.querySelector('[data-ways-label-input]')?.addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();addLabel(box)}});
    return box;
  }
  function syncTagInput(g){
    const input=document.querySelector('#editor [data-k="tags"]');if(!input||!g)return;
    const visible=(Array.isArray(g.tags)?g.tags:[]).filter(t=>{
      const s=String(t||'').toLowerCase();return !s.startsWith(TYPE_PREFIX)&&!s.startsWith(LABEL_PREFIX);
    }).join(', ');
    if(input.value!==visible)input.value=visible;
  }
  function renderPanel(box,g){
    const all=definitions();const selected=rawLabelsOf(g);
    const signature=String(g?.id||'')+'|'+all.map(x=>x.key+'='+x.name).join('\\u001f')+'|'+selected.join('\\u001f');
    if(box.dataset.signature===signature)return;
    box.dataset.signature=signature;
    const count=box.querySelector('.ways-label-count');if(count)count.textContent=all.length+' LABEL'+(all.length===1?'':'S');
    const chips=box.querySelector('.ways-label-chips');if(!chips)return;
    chips.innerHTML=all.length?all.map(item=>'<button type="button" class="ways-label-chip '+(selected.includes(item.key)?'on':'')+'" data-ways-label="'+encodeURIComponent(item.key)+'" title="'+esc(item.description||'')+'">'+esc(item.name)+'</button>').join(''):'<span class="ways-label-empty">まだLABELがありません。下から最初のLABELを作れます。</span>';
  }
  function inject(){
    const editor=document.querySelector('#editor');const g=current();if(!editor||!g)return;
    const destination=editor.querySelector('.ways-destination');if(!destination)return;
    let box=editor.querySelector('.ways-label-panel');if(!box){box=makePanel();destination.insertAdjacentElement('afterend',box)}
    syncTagInput(g);renderPanel(box,g);
  }
  function refresh(){queueMicrotask(inject);setTimeout(inject,0)}
  async function loadCatalog(){
    try{
      const response=await fetch(CATALOG_API,{cache:'no-store'});const data=await response.json().catch(()=>({}));
      if(!response.ok||!data?.ok)throw new Error(data?.error||('HTTP '+response.status));
      catalog=(Array.isArray(data.labels)?data.labels:[]).map(x=>({key:String(x?.key||x?.name||'').trim(),name:String(x?.name||x?.key||'').trim(),description:String(x?.description||''),count:Number(x?.count||0),managed:Boolean(x?.managed)})).filter(x=>x.key&&x.name);
    }catch(error){console.warn('[WAYS LABELS EDITOR] catalog unavailable',error)}
    refresh();
  }
  const editor=document.querySelector('#editor');if(editor)new MutationObserver(()=>refresh()).observe(editor,{childList:true,subtree:true});
  refresh();loadCatalog();
})();
</script>`;

function captureResponse() {
  return {
    statusCode: 200,
    headers: new Map(),
    body: '',
    setHeader(name, value) { this.headers.set(String(name).toLowerCase(), value); },
    status(code) { this.statusCode = code; return this; },
    send(value) { this.body = String(value ?? ''); return this; },
    end(value) { this.body = String(value ?? ''); return this; },
    json(value) { this.body = JSON.stringify(value); return this; }
  };
}

function patchLabelAwareTags(source) {
  let html = source;
  const publicTagsBefore = "const publicTags=g=>(Array.isArray(g?.tags)?g.tags:[]).filter(t=>!String(t||'').toLowerCase().startsWith(PREFIX));";
  const publicTagsAfter = "const publicTags=g=>(Array.isArray(g?.tags)?g.tags:[]).filter(t=>{const s=String(t||'').toLowerCase();return !s.startsWith(PREFIX)&&!s.startsWith('__ways_label:')});";
  const setMarkerBefore = "const tags=publicTags(g);\n    if(normalize(kind)==='tip')tags.push(PREFIX+'tip');\n    g.tags=tags;";
  const setMarkerAfter = "const labels=(Array.isArray(g?.tags)?g.tags:[]).filter(t=>String(t||'').toLowerCase().startsWith('__ways_label:'));\n    const tags=publicTags(g);\n    if(normalize(kind)==='tip')tags.push(PREFIX+'tip');\n    g.tags=[...tags,...labels];";
  const preserveTypeOnly = "...(g.tags||[]).filter(x=>String(x||'').toLowerCase().startsWith('__ways_type:'))";
  const preserveReserved = "...(g.tags||[]).filter(x=>{const s=String(x||'').toLowerCase();return s.startsWith('__ways_type:')||s.startsWith('__ways_label:')})";
  const hideTypeOnly = "!String(t||'').toLowerCase().startsWith('__ways_type:')";
  const hideReserved = "!String(t||'').toLowerCase().startsWith('__ways_type:')&&!String(t||'').toLowerCase().startsWith('__ways_label:')";
  const feedPreviewButton = '<button id="feedPreview" class="btn">フィードプレビュー</button>';
  const managerButton = '<a id="waysLabelManager" class="btn" href="/ways-labels-admin/" target="_top" style="text-decoration:none">LABEL管理</a>';

  if (!html.includes(publicTagsBefore) || !html.includes(setMarkerBefore) || !html.includes(preserveTypeOnly) || !html.includes(feedPreviewButton)) {
    throw new Error('base_editor_label_patch_shape_changed');
  }
  html = html.replace(publicTagsBefore, publicTagsAfter);
  html = html.replace(setMarkerBefore, setMarkerAfter);
  html = html.replaceAll(preserveTypeOnly, preserveReserved);
  html = html.replaceAll(hideTypeOnly, hideReserved);
  html = html.replace(feedPreviewButton, managerButton + feedPreviewButton);
  html = html.replace('</head>', `${LABEL_STYLE}</head>`);
  html = html.replace('</body>', `${LABEL_SCRIPT}</body>`);
  return html;
}

export default async function handler(req, res) {
  const captured = captureResponse();
  await baseHandler(req, captured);
  if (captured.statusCode !== 200 || !captured.body.includes('</html>')) {
    for (const [name, value] of captured.headers) res.setHeader(name, value);
    return res.status(captured.statusCode).send(captured.body);
  }
  try {
    const html = patchLabelAwareTags(captured.body);
    res.setHeader('Cache-Control', 'no-store');
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    return res.status(200).send(html);
  } catch (error) {
    console.error('[playback-editor-page-labels]', error);
    return res.status(502).send('PLAYBACK EDITOR label bridge is temporarily unavailable.');
  }
}
