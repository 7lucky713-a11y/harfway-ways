(() => {
  const KINDS={typo:'誤字',duplicate:'重複',punctuation:'記号',notation:'表記',warning:'要確認'};
  const FIXED=[
    ['見つけれられ','見つけられ','typo','「れ」が重複している可能性があります。'],
    ['シュミレーション','シミュレーション','typo','一般的な表記は「シミュレーション」です。'],
    ['コミニュケーション','コミュニケーション','typo','一般的な表記は「コミュニケーション」です。'],
    ['コミニュティ','コミュニティ','typo','一般的な表記は「コミュニティ」です。'],
    ['うる覚え','うろ覚え','typo','一般的な表記は「うろ覚え」です。'],
    ['HARFWAY','HARF-WAY','notation','HARF-WAYのブランド表記に統一します。'],
    ['HARF WAY','HARF-WAY','notation','HARF-WAYのブランド表記に統一します。']
  ];
  const PARTICLES=[['がが','が'],['をを','を'],['にに','に'],['でで','で'],['へへ','へ']];
  const BRACKETS={'「':'」','『':'』','（':'）','(':')','【':'】','[':']','｛':'｝','{':'}'};
  const CLOSERS=Object.fromEntries(Object.entries(BRACKETS).map(([a,b])=>[b,a]));
  const state={suggestions:[]};
  const $=(s,r=document)=>r.querySelector(s);

  function toast(msg,bad=false){
    const el=$('#toast'); if(!el)return;
    el.textContent=msg; el.style.background=bad?'#8d4848':'';
    el.classList.add('on'); clearTimeout(el._proofTimer);
    el._proofTimer=setTimeout(()=>{el.classList.remove('on');el.style.background=''},2200);
  }
  function add(list,item){
    const key=[item.field,item.start,item.end,item.after||'',item.reason||''].join('|');
    if(item.start<0||item.end<item.start||list.some(x=>x._key===key))return;
    list.push({...item,_key:key});
  }
  function each(text,q,fn){
    let p=0; while(q&&p<=text.length){const i=text.indexOf(q,p);if(i<0)break;fn(i);p=i+Math.max(1,q.length)}
  }
  function fixed(field,text,list){
    FIXED.forEach(([from,to,kind,reason])=>each(text,from,start=>add(list,{field,kind,start,end:start+from.length,before:from,after:to,reason,actionable:true})));
  }
  function duplicates(field,text,list){
    PARTICLES.forEach(([from,to])=>each(text,from,start=>add(list,{field,kind:'duplicate',start,end:start+from.length,before:from,after:to,reason:'同じ助詞が連続しています。入力時の重複なら1つにできます。',actionable:true})));
    [
      [/。{2,}/g,'。','句点'],
      [/、{2,}/g,'、','読点'],
      [/，{2,}/g,'，','全角カンマ'],
      [/．{2,}/g,'．','全角ピリオド']
    ].forEach(([regex,to,label])=>{
      regex.lastIndex=0; let m;
      while((m=regex.exec(text))) add(list,{field,kind:'punctuation',start:m.index,end:m.index+m[0].length,before:m[0],after:to,reason:label+'が連続しています。',actionable:true});
    });
  }
  function brackets(field,text,list){
    const stack=[];
    for(let i=0;i<text.length;i++){
      const ch=text[i];
      if(BRACKETS[ch]){stack.push({ch,i});continue}
      if(!CLOSERS[ch])continue;
      const top=stack[stack.length-1],want=CLOSERS[ch];
      if(top?.ch===want){stack.pop();continue}
      add(list,{field,kind:'warning',start:i,end:i+1,before:ch,after:ch,reason:'対応する「'+want+'」が見つかりません。括弧の対応を確認してください。',actionable:false});
    }
    stack.forEach(x=>add(list,{field,kind:'warning',start:x.i,end:x.i+1,before:x.ch,after:x.ch,reason:'「'+x.ch+'」を閉じる「'+BRACKETS[x.ch]+'」が見つかりません。',actionable:false}));
  }
  function punctuationWarnings(field,text,list){
    const re=/。、|、。/g; let m;
    while((m=re.exec(text))) add(list,{field,kind:'warning',start:m.index,end:m.index+m[0].length,before:m[0],after:m[0],reason:'句点と読点が連続しています。どちらを残すか確認してください。',actionable:false});
  }
  function analyzeField(field,text){
    const list=[]; fixed(field,text,list); duplicates(field,text,list); brackets(field,text,list); punctuationWarnings(field,text,list); return list;
  }
  function analyze(){
    const title=String($('#note-title')?.value||''),body=String($('#note-body')?.value||'');
    return [...analyzeField('title',title),...analyzeField('body',body)]
      .sort((a,b)=>a.field!==b.field?(a.field==='title'?-1:1):a.start-b.start||a.end-b.end)
      .slice(0,50);
  }

  function styles(){
    if($('#game-note-proofread-styles'))return;
    const s=document.createElement('style');s.id='game-note-proofread-styles';
    s.textContent=`
      #proofread-note{border-color:#647064;color:#d6dfd6}
      .proofread-panel{grid-column:1/-1;display:none;border:1px solid #465147;border-radius:10px;background:#111713;overflow:hidden}.proofread-panel.on{display:block}
      .proofread-head{display:flex;align-items:center;justify-content:space-between;gap:10px;padding:11px 13px;border-bottom:1px solid var(--line)}
      .proofread-head b{font:900 10px ui-monospace,monospace;letter-spacing:.08em;color:#c8d3c9}.proofread-head span{font-size:9px;color:var(--muted);line-height:1.5;text-align:right}
      .proofread-empty{padding:16px 13px;color:#88958a;font-size:11px;line-height:1.7}.proofread-list{display:grid}.proofread-item{padding:13px;border-bottom:1px solid var(--line)}.proofread-item:last-child{border-bottom:0}
      .proofread-meta{display:flex;align-items:center;gap:7px;margin-bottom:8px}.proofread-kind{display:inline-flex;border:1px solid #5d6c60;border-radius:999px;padding:4px 7px;font:900 8px ui-monospace,monospace;color:#dff238}.proofread-field{font:800 8px ui-monospace,monospace;color:#758178}
      .proofread-change{display:grid;grid-template-columns:1fr auto 1fr;gap:8px;align-items:center}.proofread-text{border:1px solid var(--line);background:#171d19;border-radius:7px;padding:9px 10px;white-space:pre-wrap;overflow-wrap:anywhere;font-size:11px;line-height:1.6}.proofread-arrow{color:#718078;font-weight:900}
      .proofread-reason{margin-top:8px;color:#869188;font-size:10px;line-height:1.6}.proofread-actions{display:flex;justify-content:flex-end;margin-top:9px}.proofread-actions button{border:1px solid #607063;background:#1b241d;color:#dbe5dc;border-radius:7px;padding:7px 10px;font-size:10px;font-weight:900;cursor:pointer}
      .proofread-warning{font-size:10px;color:#c7a879;border:1px solid #665c45;border-radius:7px;padding:8px 10px;background:#1b1913}
      @media(max-width:700px){.proofread-change{grid-template-columns:1fr}.proofread-arrow{transform:rotate(90deg);justify-self:center}.proofread-head{align-items:flex-start;flex-direction:column}.proofread-head span{text-align:left}}
    `;
    document.head.appendChild(s);
  }
  function ensureUi(){
    styles();const form=$('#note-form'),body=$('#note-body'),foot=$('#note-form .dialog-foot');if(!form||!body||!foot)return false;
    if(!$('#proofread-note')){
      const b=document.createElement('button');b.type='button';b.className='ghost';b.id='proofread-note';b.textContent='誤字脱字チェック';
      const cancel=foot.querySelector('[data-close="note"]');foot.insertBefore(b,cancel||$('#save-note'));b.addEventListener('click',run);
    }
    if(!$('#note-proofread-panel')){
      const p=document.createElement('section');p.id='note-proofread-panel';p.className='proofread-panel';p.setAttribute('aria-live','polite');body.closest('label')?.insertAdjacentElement('afterend',p);
    }
    body.setAttribute('spellcheck','true');return true;
  }
  function fieldEl(field){return field==='title'?$('#note-title'):$('#note-body')}
  function fieldLabel(field){return field==='title'?'タイトル':'本文'}
  function excerpt(text,start,end){
    const a=Math.max(0,start-12),b=Math.min(text.length,end+12);
    return (a?'…':'')+text.slice(a,b)+(b<text.length?'…':'');
  }
  function render(){
    const panel=$('#note-proofread-panel');if(!panel)return;panel.classList.add('on');panel.innerHTML='';
    const head=document.createElement('div');head.className='proofread-head';
    const strong=document.createElement('b');strong.textContent='PROOFREAD · '+state.suggestions.length+'件';
    const help=document.createElement('span');help.textContent='AI不使用・ブラウザ内だけで判定。本文は自動で書き換えません。';head.append(strong,help);panel.appendChild(head);
    if(!state.suggestions.length){const e=document.createElement('div');e.className='proofread-empty';e.textContent='登録済みルールに該当する誤字脱字は見つかりませんでした。';panel.appendChild(e);return}
    const list=document.createElement('div');list.className='proofread-list';
    state.suggestions.forEach((s,index)=>{
      const field=fieldEl(s.field),text=String(field?.value||''),item=document.createElement('article');item.className='proofread-item';
      const meta=document.createElement('div');meta.className='proofread-meta';
      const kind=document.createElement('span');kind.className='proofread-kind';kind.textContent=KINDS[s.kind]||'校正';
      const where=document.createElement('span');where.className='proofread-field';where.textContent=fieldLabel(s.field);meta.append(kind,where);item.appendChild(meta);
      if(s.actionable){
        const change=document.createElement('div');change.className='proofread-change';
        const before=document.createElement('div');before.className='proofread-text';before.textContent=excerpt(text,s.start,s.end);
        const arrow=document.createElement('span');arrow.className='proofread-arrow';arrow.textContent='→';
        const after=document.createElement('div');after.className='proofread-text';
        const next=text.slice(0,s.start)+s.after+text.slice(s.end);after.textContent=excerpt(next,s.start,s.start+s.after.length);change.append(before,arrow,after);item.appendChild(change);
      }else{
        const warn=document.createElement('div');warn.className='proofread-warning';warn.textContent=excerpt(text,s.start,s.end);item.appendChild(warn);
      }
      const reason=document.createElement('div');reason.className='proofread-reason';reason.textContent=s.reason;item.appendChild(reason);
      if(s.actionable){
        const acts=document.createElement('div');acts.className='proofread-actions';const b=document.createElement('button');b.type='button';b.dataset.applyProofread=String(index);b.textContent='この修正を反映';acts.appendChild(b);item.appendChild(acts);
      }
      list.appendChild(item);
    });panel.appendChild(list);
  }
  function run(){
    if(!String($('#note-body')?.value||'').trim())return toast('先に本文を入力してください',true);
    state.suggestions=analyze();render();
  }
  function apply(index){
    const s=state.suggestions[index];if(!s?.actionable)return;
    const field=fieldEl(s.field),text=String(field?.value||'');if(!field)return;
    if(text.slice(s.start,s.end)!==s.before){toast('本文が変わったため、もう一度チェックしてください。',true);return run()}
    field.value=text.slice(0,s.start)+s.after+text.slice(s.end);field.dispatchEvent(new Event('input',{bubbles:true}));toast('修正を反映しました');run();
  }
  function reset(){state.suggestions=[];const p=$('#note-proofread-panel');if(p){p.classList.remove('on');p.innerHTML=''}}
  function init(){
    if(!ensureUi())return;
    $('#note-proofread-panel')?.addEventListener('click',e=>{const b=e.target.closest('[data-apply-proofread]');if(b)apply(Number(b.dataset.applyProofread))});
    const overlay=$('#note-overlay');if(overlay){let was=overlay.classList.contains('on');new MutationObserver(()=>{const open=overlay.classList.contains('on');if(open&&!was)reset();was=open}).observe(overlay,{attributes:true,attributeFilter:['class','aria-hidden']})}
  }
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',init,{once:true});else init();
})();
