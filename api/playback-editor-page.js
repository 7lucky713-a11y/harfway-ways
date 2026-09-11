const UPSTREAM = process.env.PLAYBACK_EDITOR_UPSTREAM || 'https://harfway-playback-editor.vercel.app';

const PATCH_STYLE = `
<style id="ways-content-type-style">
.ways-destination{margin:0;padding:14px;border:1px solid #596124;border-radius:12px;background:#15160f}
.ways-destination-head{display:flex;align-items:flex-start;justify-content:space-between;gap:12px;margin-bottom:10px}
.ways-destination-head strong{display:block;font-size:12px}.ways-destination-head small{display:block;margin-top:3px;color:#a7a77f;font-size:10px;line-height:1.45}
.ways-new{display:inline-flex;align-items:center;border:1px solid #596124;color:var(--a);border-radius:999px;padding:4px 7px;font-size:9px;font-weight:900}
.ways-destination-types{display:grid;grid-template-columns:1fr 1fr;gap:8px}
.ways-dest{border:1px solid #3b3e42;background:#0b0c0e;color:#b8bbc1;border-radius:10px;padding:11px 12px;text-align:left;cursor:pointer}
.ways-dest b{display:block;font-size:12px}.ways-dest span{display:block;color:#7f838a;font-size:10px;margin-top:4px;line-height:1.4}
.ways-dest.on{border-color:var(--a);box-shadow:inset 0 0 0 1px var(--a);background:#171a0e}.ways-dest.on b{color:var(--a)}
@media(max-width:700px){.ways-destination-types{grid-template-columns:1fr}}
</style>`;

const PATCH_SCRIPT = `
<script id="ways-content-type-script">
(()=>{
  const normalize=v=>String(v||'').toLowerCase()==='tip'?'tip':'discover';
  const current=()=>window.__peCur?.()||null;
  const state=()=>window.__peState?.()||{games:[]};
  function updateButtons(box,g){
    const kind=normalize(g?.contentType);
    box.querySelectorAll('[data-ways-kind]').forEach(btn=>btn.classList.toggle('on',btn.dataset.waysKind===kind));
  }
  function markDirty(){
    const input=document.querySelector('#editor [data-k="description"]');
    if(input) input.dispatchEvent(new Event('input',{bubbles:true}));
  }
  function setKind(kind){
    const g=current(); if(!g)return;
    g.contentType=normalize(kind);
    markDirty();
    queueMicrotask(injectEditor);
    setTimeout(()=>{injectEditor();refreshLive();refreshListTypes();},0);
  }
  function makeBox(){
    const box=document.createElement('div');
    box.className='ways-destination';
    box.innerHTML='<div class="ways-destination-head"><div><strong>投稿先</strong><small>WAYS内でどの棚に表示するかを選びます。</small></div><span class="ways-new">NEW</span></div><div class="ways-destination-types"><button type="button" class="ways-dest" data-ways-kind="discover"><b>DISCOVER</b><span>ゲームを見つけてもらう通常のWAYS</span></button><button type="button" class="ways-dest" data-ways-kind="tip"><b>TIP</b><span>攻略・小ネタ・遊び方のヒント</span></button></div>';
    box.querySelectorAll('[data-ways-kind]').forEach(btn=>btn.addEventListener('click',()=>setKind(btn.dataset.waysKind)));
    return box;
  }
  function injectEditor(){
    const editor=document.querySelector('#editor'); const g=current(); if(!editor||!g)return;
    const description=editor.querySelector('[data-k="description"]')?.closest('.field'); if(!description)return;
    let box=editor.querySelector('.ways-destination');
    if(!box){box=makeBox();description.insertAdjacentElement('afterend',box)}
    updateButtons(box,g);
  }
  function refreshLive(){
    const g=current(); const label=document.querySelector('#live .label'); if(!g||!label)return;
    const status=g.status==='published'?'PUBLISHED':'DRAFT PREVIEW';
    label.textContent=(g.sponsored?'SPONSORED · ':'')+normalize(g.contentType).toUpperCase()+' · '+status;
  }
  function refreshListTypes(){
    const games=Array.isArray(state()?.games)?state().games:[];
    document.querySelectorAll('#list [data-id]').forEach(btn=>{
      const g=games.find(x=>String(x.id)===String(btn.dataset.id)); const small=btn.querySelector('small'); if(!g||!small)return;
      const category=String(g.category||'ジャンル未設定');
      small.textContent=category+' / '+normalize(g.contentType).toUpperCase();
    });
  }
  function refreshAll(){injectEditor();refreshLive();refreshListTypes()}
  const editor=document.querySelector('#editor'); if(editor)new MutationObserver(()=>queueMicrotask(refreshAll)).observe(editor,{childList:true,subtree:true});
  const list=document.querySelector('#list'); if(list)new MutationObserver(()=>queueMicrotask(refreshListTypes)).observe(list,{childList:true,subtree:true});
  const live=document.querySelector('#live'); if(live)new MutationObserver(()=>queueMicrotask(refreshLive)).observe(live,{childList:true,subtree:true});
  refreshAll();
})();
</script>`;

function patchEditorHtml(source) {
  let html = source;
  const apiConst = "const A='/api/proxy?target=',K='hw-playback-editor-admin-key';";
  const curFn = "function cur(){return S.games.find(x=>x.id===sel)}";
  const normTail = "g.sponsorName=g.sponsorName||g.sponsor_name||'';return g}";

  if (!html.includes(apiConst) || !html.includes(curFn) || !html.includes(normTail)) {
    throw new Error('upstream_editor_shape_changed');
  }

  html = html.replace(apiConst, "const A='/api/playback-editor-proxy?target=',K='hw-playback-editor-admin-key';");
  html = html.replace("fetch('/api/genre'", "fetch('/api/playback-editor-genre'");
  html = html.replace("fetch('/api/process-video'", "fetch('/api/playback-editor-process-video'");
  html = html.replace(curFn, `${curFn}window.__peCur=cur;window.__peState=()=>S;`);
  html = html.replace(normTail, "g.sponsorName=g.sponsorName||g.sponsor_name||'';g.contentType=String(g.contentType||g.content_type||'').toLowerCase()==='tip'?'tip':'discover';return g}");
  html = html.replace("sponsored:false,sponsorName:''});sel=id;", "sponsored:false,sponsorName:'',contentType:'discover'});sel=id;");
  html = html.replace('</head>', `${PATCH_STYLE}</head>`);
  html = html.replace('</body>', `${PATCH_SCRIPT}</body>`);
  return html;
}

export default async function handler(req, res) {
  res.setHeader('Cache-Control', 'no-store');
  if (req.method !== 'GET') return res.status(405).send('Method Not Allowed');
  try {
    const upstream = await fetch(`${UPSTREAM}/`, { method: 'GET', cache: 'no-store', headers: { accept: 'text/html' } });
    if (!upstream.ok) throw new Error(`upstream_editor_${upstream.status}`);
    const source = await upstream.text();
    const html = patchEditorHtml(source);
    res.setHeader('Content-Type', 'text/html; charset=utf-8');
    res.setHeader('X-Robots-Tag', 'noindex, nofollow');
    return res.status(200).send(html);
  } catch (error) {
    console.error('[playback-editor-page]', error);
    res.setHeader('Content-Type', 'text/plain; charset=utf-8');
    return res.status(502).send('PLAYBACK EDITOR bridge is temporarily unavailable.');
  }
}
