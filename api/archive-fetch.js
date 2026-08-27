function decodeEntities(value=''){
  return String(value)
    .replace(/&nbsp;/gi,' ')
    .replace(/&amp;/gi,'&')
    .replace(/&quot;/gi,'"')
    .replace(/&#39;/gi,"'")
    .replace(/&lt;/gi,'<')
    .replace(/&gt;/gi,'>')
    .replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(Number(n)||32))
    .replace(/&#x([0-9a-f]+);/gi,(_,n)=>String.fromCodePoint(parseInt(n,16)||32));
}

function hasTemplateGarbage(value=''){
  return /\$\{|escapeHTML\s*\(|\bgame\.(?:title|steam|comment|developer|store|url)\b|\bEDITOR['’]?S PICK\b|\b(?:STORE PAGE|DEVELOPER)\b[\s\S]*[?:]/i.test(String(value));
}

function stripHtml(html=''){
  return decodeEntities(String(html)
    .replace(/<script[\s\S]*?<\/script>/gi,' ')
    .replace(/<style[\s\S]*?<\/style>/gi,' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi,' ')
    .replace(/<template[\s\S]*?<\/template>/gi,' ')
    .replace(/<br\s*\/?\s*>/gi,'\n')
    .replace(/<\/(p|h[1-6]|div|section|article|li|blockquote)>/gi,'\n')
    .replace(/<[^>]+>/g,' ')
    .replace(/[\t\r ]+/g,' ')
    .replace(/\n\s+/g,'\n')
    .replace(/\n{3,}/g,'\n\n')
    .trim());
}

function isBoilerplate(text=''){
  const s=String(text).trim();
  if(!s)return true;
  if(hasTemplateGarbage(s))return true;
  if(/^(https?:\/\/|www\.)/i.test(s))return true;
  if(/Amazonをご利用の方|Amazonアソシエイト|アフィリエイト|プライバシーポリシー|Cookie|無断転載|著作権/i.test(s))return true;
  if(/^(STORE PAGE|DEVELOPER|EDITOR['’]?S PICK)$/i.test(s))return true;
  return false;
}

function cleanText(value=''){
  const text=stripHtml(value)
    .replace(/\$\{[^}]*\}/g,' ')
    .replace(/\s+/g,' ')
    .trim();
  return isBoilerplate(text)?'':text;
}

function extractReadableBlocks(html=''){
  const raw=String(html||'');
  const out=[];
  const seen=new Set();
  for(const m of raw.matchAll(/<(p|h[2-6]|li|blockquote)\b[^>]*>([\s\S]*?)<\/\1>/gi)){
    if(hasTemplateGarbage(m[0]))continue;
    const text=cleanText(m[2]);
    if(!text||text.length<2)continue;
    const key=text.normalize('NFKC');
    if(seen.has(key))continue;
    seen.add(key);
    out.push(text);
  }
  return out.join('\n\n').slice(0,150000);
}

function pick(html,patterns){
  for(const re of patterns){
    const m=String(html).match(re);
    if(m?.[1])return stripHtml(m[1]);
  }
  return '';
}

function attr(tag,name){
  const m=String(tag).match(new RegExp(`${name}=["']([^"']*)["']`,'i'));
  return m?.[1]?decodeEntities(m[1]):'';
}

function absoluteUrl(src,base){try{return new URL(src,base).toString()}catch{return ''}}

function cleanCandidate(value=''){
  const text=stripHtml(value)
    .replace(/\$\{[^}]+\}/g,' ')
    .replace(/escapeHTML\s*\([^)]*\)/gi,' ')
    .replace(/\s*[|｜]\s*HARF[- ]?WAY.*$/i,'')
    .replace(/\s*[–—-]\s*(Steam|itch\.io|BOOTH|DLsite|Nintendo.*|PlayStation.*|Xbox.*)$/i,'')
    .replace(/^(Steam|itch\.io|BOOTH|DLsite)[:：\s-]*/i,'')
    .replace(/\s+/g,' ')
    .trim();
  if(!text||hasTemplateGarbage(text))return '';
  if(/\b(const|let|var|function|return|escapehtml|game\.)\b/i.test(text))return '';
  return text;
}

function hintConfidence(source=''){
  if(source==='page-title-short')return 100;
  if(source==='store-link-text'||source==='script-game-title')return 98;
  if(source==='steam-slug'||source==='itch-slug')return 96;
  if(source==='page-title')return 92;
  if(source==='page-slug')return 82;
  if(source.startsWith('heading-'))return 78;
  return 70;
}

function hintKey(value=''){
  return cleanCandidate(value).normalize('NFKC').toLowerCase().replace(/[\s:：・!！?？'"“”‘’()（）\[\]【】_\-–—～~]+/g,'');
}

function sameStore(a='',b=''){
  if(!a||!b)return false;
  try{
    const ua=new URL(a),ub=new URL(b);
    if(ua.hostname!==ub.hostname)return false;
    const steamA=ua.pathname.match(/\/app\/(\d+)/)?.[1]||'';
    const steamB=ub.pathname.match(/\/app\/(\d+)/)?.[1]||'';
    if(steamA&&steamB)return steamA===steamB;
    return ua.origin+ua.pathname.replace(/\/$/,'')===ub.origin+ub.pathname.replace(/\/$/,'');
  }catch{return a===b}
}

function looksSameGame(a,b){
  const ka=hintKey(a?.name),kb=hintKey(b?.name);
  if(!ka||!kb)return false;
  if(ka===kb||sameStore(a?.url,b?.url))return true;
  const shorter=ka.length<=kb.length?ka:kb;
  const longer=ka.length>kb.length?ka:kb;
  return shorter.length>=5&&longer.includes(shorter);
}

function mergeHint(prev,item){
  const preferred=(item.confidence>prev.confidence)||(item.confidence===prev.confidence&&item.name.length>prev.name.length)?item:prev;
  const other=preferred===item?prev:item;
  return {...other,...preferred,url:preferred.url||other.url||'',confidence:Math.max(Number(prev.confidence||0),Number(item.confidence||0)),sources:[...new Set([...(prev.sources||[prev.source]).filter(Boolean),...(item.sources||[item.source]).filter(Boolean)])]};
}

function uniqueHints(items){
  const result=[];
  for(const raw of items){
    const name=cleanCandidate(raw.name||'');
    if(!name||name.length<2||name.length>120)continue;
    const item={...raw,name,confidence:Number(raw.confidence||hintConfidence(raw.source)),sources:[raw.source].filter(Boolean)};
    const index=result.findIndex(prev=>looksSameGame(prev,item));
    if(index>=0)result[index]=mergeHint(result[index],item);else result.push(item);
  }
  return result.sort((a,b)=>b.confidence-a.confidence).slice(0,120);
}

function addTitleHints(items,title){
  const t=cleanCandidate(title);if(!t)return;
  for(const m of t.matchAll(/[『「【《]([^』」】》]{2,120})[』」】》]/g)){
    const full=cleanCandidate(m[1]);if(!full)continue;
    items.push({name:full,source:'page-title',url:'',confidence:92});
    const short=full.split(/\s+[–—-]\s+/)[0]?.trim();
    if(short&&short!==full)items.push({name:short,source:'page-title-short',url:'',confidence:100});
  }
  for(const m of t.matchAll(/["“‘']([^"”’']{2,100})["”’']/g))items.push({name:m[1],source:'page-title',url:'',confidence:90});
}

function addPageSlugHint(items,baseUrl){
  try{
    const u=new URL(baseUrl),seg=u.pathname.split('/').filter(Boolean),slug=seg.at(-1)||'';
    if(slug&&slug.length>=2&&!/^(game|games|weekly|yorimichi|article|articles)$/i.test(slug))items.push({name:decodeURIComponent(slug).replace(/[-_]+/g,' '),source:'page-slug',url:'',confidence:82});
  }catch{}
}

function isStoreHost(host=''){return /store\.steampowered\.com|itch\.io|booth\.pm|dlsite\.com|nintendo\.|playstation\.|xbox\./i.test(host)}

function addStoreHint(items,href,text=''){
  if(!href||hasTemplateGarbage(href))return;
  let u;try{u=new URL(href)}catch{return}
  const host=u.hostname.toLowerCase();if(!isStoreHost(host))return;
  const clean=cleanCandidate(text);
  if(clean&&!/^(store page|steam|store|official|公式|購入|販売ページ)$/i.test(clean))items.push({name:clean,source:'store-link-text',url:href,confidence:98});
  if(host==='store.steampowered.com'){
    const seg=u.pathname.split('/').filter(Boolean),i=seg.findIndex(x=>x==='app'),slug=i>=0?seg[i+2]||'':'';
    if(slug)items.push({name:decodeURIComponent(slug).replace(/_/g,' '),source:'steam-slug',url:href,confidence:96});
  }else if(host.endsWith('itch.io')){
    const slug=host.split('.')[0];if(slug&&slug!=='www')items.push({name:slug.replace(/-/g,' '),source:'itch-slug',url:href,confidence:96});
  }
}

function extractScriptGameHints(html,items){
  const raw=String(html).replace(/\\\//g,'/').replace(/&quot;/gi,'"').replace(/&#39;/gi,"'");
  for(const m of raw.matchAll(/https?:\/\/store\.steampowered\.com\/app\/\d+\/[^\s"'<>\\)]+/gi))addStoreHint(items,m[0],'');
  for(const m of raw.matchAll(/(?:title|name)\s*:\s*(["'`])([^"'`]{2,120})\1[\s\S]{0,500}?(?:steam|storeUrl|store_url)\s*:\s*(["'`])(https?:\/\/[^"'`]+)\3/gi))addStoreHint(items,m[4],m[2]);
}

function extractNameHints(html,baseUrl,pageTitle){
  const items=[];addTitleHints(items,pageTitle);addPageSlugHint(items,baseUrl);
  const scope=String(html).match(/<article[^>]*>([\s\S]*?)<\/article>/i)?.[1]||html;
  for(const m of scope.matchAll(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi)){
    const name=cleanCandidate(m[2]);if(name)items.push({name,source:`heading-h${m[1]}`,url:'',confidence:78});
  }
  for(const m of scope.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi))addStoreHint(items,absoluteUrl(decodeEntities(m[1]),baseUrl),m[2]);
  extractScriptGameHints(html,items);return uniqueHints(items);
}

function extractImages(html,baseUrl){
  const result=[],seen=new Set(),raw=String(html||'');
  const featuredRaw=raw.match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)?.[1]||'';
  const featured=!hasTemplateGarbage(featuredRaw)?absoluteUrl(decodeEntities(featuredRaw),baseUrl):'';
  if(featured){seen.add(featured);result.push({url:featured,alt:'',featured:true})}
  for(const m of raw.matchAll(/<img\b[^>]*>/gi)){
    const tag=m[0];if(hasTemplateGarbage(tag))continue;
    const src=attr(tag,'data-src')||attr(tag,'data-lazy-src')||attr(tag,'src');if(!src||hasTemplateGarbage(src))continue;
    const url=absoluteUrl(src,baseUrl);if(!url||seen.has(url)||/^data:/i.test(url)||/%24%7B/i.test(url))continue;
    const alt=attr(tag,'alt');if(hasTemplateGarbage(alt))continue;
    seen.add(url);result.push({url,alt,featured:false});if(result.length>=100)break;
  }
  return result;
}

function fieldPenalty(path=''){
  const p=path.toLowerCase();
  let n=0;
  if(/(?:^|\.)(?:link|guid|slug|date|modified|status|type|template|author|id)$/.test(p))n+=1000;
  if(/_links|yoast|rank_math|jetpack|media|image|thumbnail|avatar|caption|alt_text/.test(p))n+=500;
  if(/excerpt/.test(p))n+=120;
  return n;
}

function fieldBonus(path=''){
  const p=path.toLowerCase();
  let n=0;
  if(/acf|custom|meta/.test(p))n+=160;
  if(/body|content|text|description|summary|review|comment|note|intro|point|catch|scene|memo/.test(p))n+=120;
  return n;
}

function textScore(text='',path=''){
  const t=String(text).trim();if(!t||isBoilerplate(t))return -9999;
  const jp=(t.match(/[ぁ-んァ-ヶ一-龯]/g)||[]).length;
  const urls=(t.match(/https?:\/\//g)||[]).length;
  return Math.min(t.length,4000)+Math.min(jp,1000)*1.8+fieldBonus(path)-fieldPenalty(path)-urls*120;
}

function collectTextFields(value,path='',out=[],depth=0){
  if(depth>7||value==null)return out;
  if(typeof value==='string'){
    const text=/<[a-z][\s\S]*>/i.test(value)?extractReadableBlocks(value)||cleanText(value):cleanText(value);
    if(text&&text.length>=24)out.push({path,text,score:textScore(text,path),order:out.length});
    return out;
  }
  if(Array.isArray(value)){
    value.forEach((v,i)=>collectTextFields(v,`${path}[${i}]`,out,depth+1));return out;
  }
  if(typeof value==='object')for(const [k,v] of Object.entries(value))collectTextFields(v,path?`${path}.${k}`:k,out,depth+1);
  return out;
}

function selectWordPressText(row){
  const fields=collectTextFields(row).filter(x=>x.score>80);
  const preferred=fields.filter(x=>/^(acf|meta|custom)(?:\.|\[)/i.test(x.path)||/(?:\.)(body|text|description|summary|review|comment|note|intro|point|catch|scene|memo)(?:\.|\[|$)/i.test(x.path));
  const pool=preferred.length?preferred:fields;
  pool.sort((a,b)=>b.score-a.score);
  if(!pool.length)return {text:'',source:'none',fields:[]};

  const best=pool[0];
  const root=best.path.split('.')[0].replace(/\[.*$/,'');
  const sameRoot=fields.filter(x=>x.path.split('.')[0].replace(/\[.*$/,'')===root&&x.score>120).sort((a,b)=>a.order-b.order);
  const selected=sameRoot.length>1?sameRoot:[best];
  const seen=new Set(),parts=[];
  for(const f of selected){
    const key=f.text.normalize('NFKC');if(seen.has(key))continue;seen.add(key);parts.push(f.text);
  }
  return {text:parts.join('\n\n').slice(0,150000),source:selected.map(x=>x.path).join(', ').slice(0,500),fields:pool.slice(0,8).map(x=>({path:x.path,score:Math.round(x.score),length:x.text.length}))};
}

function extractJsonLdText(html=''){
  const candidates=[];
  for(const m of String(html).matchAll(/<script[^>]+type=["']application\/ld\+json["'][^>]*>([\s\S]*?)<\/script>/gi)){
    try{
      const data=JSON.parse(m[1]);
      const stack=Array.isArray(data)?data:[data];
      while(stack.length){
        const x=stack.pop();if(!x||typeof x!=='object')continue;
        if(typeof x.articleBody==='string')candidates.push({path:'jsonld.articleBody',text:cleanText(x.articleBody)});
        if(Array.isArray(x['@graph']))stack.push(...x['@graph']);
      }
    }catch{}
  }
  return candidates.sort((a,b)=>b.text.length-a.text.length)[0]||null;
}

async function fetchJson(url){
  try{
    const r=await fetch(url,{headers:{'user-agent':'HARF-WAY Archive Salvager/0.9','accept':'application/json'},redirect:'follow'});
    if(!r.ok)return null;return await r.json();
  }catch{return null}
}

async function fetchWordPressRecord(pageUrl){
  const u=new URL(pageUrl),parts=u.pathname.split('/').filter(Boolean),slug=parts.at(-1)||'',route=parts[0]||'';
  if(!slug)return null;
  const candidates=[];
  const typeData=await fetchJson(`${u.origin}/wp-json/wp/v2/types`);
  if(typeData&&typeof typeData==='object'){
    const types=Object.values(typeData).sort((a,b)=>((a?.rest_base===route||a?.slug===route)?0:1)-((b?.rest_base===route||b?.slug===route)?0:1));
    for(const t of types){const base=String(t?.rest_base||'').trim();if(base)candidates.push(base)}
  }
  if(route)candidates.unshift(route);candidates.push('posts','pages');
  for(const restBase of [...new Set(candidates)]){
    if(!/^[a-z0-9_-]+$/i.test(restBase))continue;
    const rows=await fetchJson(`${u.origin}/wp-json/wp/v2/${restBase}?slug=${encodeURIComponent(slug)}&per_page=1`);
    if(!Array.isArray(rows)||!rows[0])continue;
    const row=rows[0],selection=selectWordPressText(row),rendered=String(row?.content?.rendered||''),images=extractImages(rendered,pageUrl);
    if(row.featured_media){
      const media=await fetchJson(`${u.origin}/wp-json/wp/v2/media/${row.featured_media}?_fields=source_url,alt_text`),src=String(media?.source_url||'');
      if(src&&!images.some(x=>x.url===src))images.unshift({url:src,alt:String(media?.alt_text||''),featured:true});
    }
    return {id:row.id,restBase,title:stripHtml(row?.title?.rendered||row?.title?.raw||''),date:String(row?.date||''),rendered,text:selection.text,contentSource:selection.source,fieldCandidates:selection.fields,images,link:String(row?.link||pageUrl)};
  }
  return null;
}

export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='GET')return res.status(405).json({ok:false,error:'method_not_allowed'});
  try{
    const raw=String(req.query?.url||'').trim();if(!raw)return res.status(400).json({ok:false,error:'url_required'});
    const url=new URL(raw);if(!/(^|\.)harf-way\.com$/i.test(url.hostname))return res.status(400).json({ok:false,error:'harf_way_url_only'});
    const response=await fetch(url.toString(),{headers:{'user-agent':'HARF-WAY Archive Salvager/0.9'},redirect:'follow'});
    if(!response.ok)return res.status(502).json({ok:false,error:`source_${response.status}`});
    const html=await response.text(),finalUrl=response.url||url.toString();
    const pageTitle=pick(html,[/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i,/<title[^>]*>([\s\S]*?)<\/title>/i]);
    const pageDate=pick(html,[/<meta[^>]+property=["']article:published_time["'][^>]+content=["']([^"']+)["']/i,/<time[^>]+datetime=["']([^"']+)["']/i]);
    const wp=await fetchWordPressRecord(finalUrl),jsonLd=extractJsonLdText(html),fallback=extractReadableBlocks(html);
    let body='',contentSource='';
    if(wp?.text&&wp.text.length>=80){body=wp.text;contentSource=`wp:${wp.restBase}#${wp.id} / ${wp.contentSource||'field discovery'}`}
    else if(jsonLd?.text&&jsonLd.text.length>=80){body=jsonLd.text;contentSource=jsonLd.path}
    else{body=fallback;contentSource='html-fallback'}
    const title=wp?.title||pageTitle,date=wp?.date||pageDate;
    const images=(wp?.images?.length?wp.images:extractImages(html,finalUrl));
    const featuredImage=images.find(x=>x.featured)?.url||images[0]?.url||'';
    const hintsSource=[wp?.rendered||'',html].join('\n');
    const nameHints=extractNameHints(hintsSource,finalUrl,title);
    const storeLinks=nameHints.filter(x=>x.url).map(x=>({name:x.name,url:x.url,source:x.source,sources:x.sources,confidence:x.confidence}));
    return res.status(200).json({ok:true,article:{url:wp?.link||finalUrl,title,date,text:body.slice(0,150000),featuredImage,images,nameHints,storeLinks,contentSource,wp:{id:wp?.id||null,restBase:wp?.restBase||null,fieldCandidates:wp?.fieldCandidates||[]}}});
  }catch(error){console.error('[archive-fetch]',error);return res.status(500).json({ok:false,error:'archive_fetch_failed'});}
}
