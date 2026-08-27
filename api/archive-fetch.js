function decodeEntities(value=''){
  return String(value)
    .replace(/&nbsp;/gi,' ')
    .replace(/&amp;/gi,'&')
    .replace(/&quot;/gi,'"')
    .replace(/&#39;/gi,"'")
    .replace(/&lt;/gi,'<')
    .replace(/&gt;/gi,'>');
}

function hasTemplateGarbage(value=''){
  return /\$\{|escapeHTML\s*\(|\bgame\.(?:title|steam|comment|developer|store|url)\b|EDITOR['’]?S PICK|\b(?:STORE PAGE|DEVELOPER)\b[\s\S]*[?:]/i.test(String(value));
}

function stripHtml(html=''){
  return decodeEntities(String(html)
    .replace(/<script[\s\S]*?<\/script>/gi,' ')
    .replace(/<style[\s\S]*?<\/style>/gi,' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi,' ')
    .replace(/<template[\s\S]*?<\/template>/gi,' ')
    .replace(/<svg[\s\S]*?<\/svg>/gi,' ')
    .replace(/<br\s*\/?\s*>/gi,'\n')
    .replace(/<[^>]+>/g,' ')
    .replace(/[\t\r ]+/g,' ')
    .replace(/\n\s+/g,'\n')
    .replace(/\n{3,}/g,'\n\n')
    .trim());
}

function cleanTextBlock(value=''){
  const text=String(value)
    .replace(/\$\{[^}]*\}/g,' ')
    .replace(/escapeHTML\s*\([^)]*\)/gi,' ')
    .replace(/[\t\r ]+/g,' ')
    .replace(/\s+([、。！？,.!?])/g,'$1')
    .trim();
  if(!text || hasTemplateGarbage(text)) return '';
  if(/^(STORE PAGE|DEVELOPER|EDITOR['’]?S PICK)$/i.test(text)) return '';
  return text;
}

function extractReadableText(html=''){
  const raw=String(html);
  const articleMatch=raw.match(/<article\b[^>]*>([\s\S]*?)<\/article>/i);
  const mainMatch=raw.match(/<main\b[^>]*>([\s\S]*?)<\/main>/i);
  let scope=articleMatch?.[1]||mainMatch?.[1]||raw;
  scope=scope
    .replace(/<script[\s\S]*?<\/script>/gi,' ')
    .replace(/<style[\s\S]*?<\/style>/gi,' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi,' ')
    .replace(/<template[\s\S]*?<\/template>/gi,' ')
    .replace(/<svg[\s\S]*?<\/svg>/gi,' ');

  const blocks=[];
  const seen=new Set();
  const blockRe=/<(p|h[1-6]|blockquote|li)\b[^>]*>([\s\S]*?)<\/\1>/gi;
  for(const match of scope.matchAll(blockRe)){
    const text=cleanTextBlock(stripHtml(match[2]));
    if(!text || text.length<2) continue;
    const key=text.normalize('NFKC').replace(/\s+/g,' ').trim();
    if(seen.has(key)) continue;
    seen.add(key);
    blocks.push(text);
    if(blocks.length>=800) break;
  }

  if(blocks.length) return blocks.join('\n\n');
  return cleanTextBlock(stripHtml(scope));
}

function pickPlain(html,patterns){
  for(const re of patterns){
    const m=String(html).match(re);
    if(m?.[1]) return cleanTextBlock(stripHtml(m[1]));
  }
  return '';
}

function attr(tag,name){
  const m=String(tag).match(new RegExp(`${name}=["']([^"']*)["']`,'i'));
  return m?.[1]?decodeEntities(m[1]):'';
}

function absoluteUrl(src,base){
  try{return new URL(src,base).toString()}catch{return ''}
}

function cleanCandidate(value=''){
  const text=stripHtml(value)
    .replace(/\$\{[^}]*\}/g,' ')
    .replace(/escapeHTML\s*\([^)]*\)/gi,' ')
    .replace(/\s*[|｜]\s*HARF[- ]?WAY.*$/i,'')
    .replace(/\s*[–—-]\s*(Steam|itch\.io|BOOTH|DLsite|Nintendo.*|PlayStation.*|Xbox.*)$/i,'')
    .replace(/^(Steam|itch\.io|BOOTH|DLsite)[:：\s-]*/i,'')
    .replace(/\s+/g,' ')
    .trim();
  if(!text || hasTemplateGarbage(text)) return '';
  if(/\b(const|let|var|function|return|escapehtml|game\.)\b/i.test(text)) return '';
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
  if(ka===kb)return true;
  if(sameStore(a?.url,b?.url))return true;
  const shorter=ka.length<=kb.length?ka:kb;
  const longer=ka.length>kb.length?ka:kb;
  return shorter.length>=5&&longer.includes(shorter);
}

function mergeHint(prev,item){
  const preferred=(item.confidence>prev.confidence)||(item.confidence===prev.confidence&&item.name.length>prev.name.length)?item:prev;
  const other=preferred===item?prev:item;
  return {
    ...other,
    ...preferred,
    url:preferred.url||other.url||'',
    confidence:Math.max(Number(prev.confidence||0),Number(item.confidence||0)),
    sources:[...new Set([...(prev.sources||[prev.source]).filter(Boolean),...(item.sources||[item.source]).filter(Boolean)])]
  };
}

function uniqueHints(items){
  const result=[];
  for(const raw of items){
    const name=cleanCandidate(raw.name||'');
    if(!name||name.length<2||name.length>120)continue;
    const item={...raw,name,confidence:Number(raw.confidence||hintConfidence(raw.source)),sources:[raw.source].filter(Boolean)};
    const index=result.findIndex(prev=>looksSameGame(prev,item));
    if(index>=0)result[index]=mergeHint(result[index],item);
    else result.push(item);
  }
  return result.sort((a,b)=>b.confidence-a.confidence).slice(0,120);
}

function addTitleHints(items,title){
  const t=cleanCandidate(title);
  if(!t)return;
  for(const m of t.matchAll(/[『「【《]([^』」】》]{2,120})[』」】》]/g)){
    const full=cleanCandidate(m[1]);
    if(!full)continue;
    items.push({name:full,source:'page-title',url:'',confidence:92});
    const short=full.split(/\s+[–—-]\s+/)[0]?.trim();
    if(short&&short!==full)items.push({name:short,source:'page-title-short',url:'',confidence:100});
  }
  for(const m of t.matchAll(/["“‘']([^"”’']{2,100})["”’']/g)){
    items.push({name:m[1],source:'page-title',url:'',confidence:90});
  }
}

function addPageSlugHint(items,baseUrl){
  try{
    const u=new URL(baseUrl);
    const seg=u.pathname.split('/').filter(Boolean);
    const slug=seg.at(-1)||'';
    if(slug&&slug.length>=2&&!/^(game|games|weekly|yorimichi|article|articles)$/i.test(slug)){
      items.push({name:decodeURIComponent(slug).replace(/[-_]+/g,' '),source:'page-slug',url:'',confidence:82});
    }
  }catch{}
}

function isStoreHost(host=''){
  return /store\.steampowered\.com|itch\.io|booth\.pm|dlsite\.com|nintendo\.|playstation\.|xbox\./i.test(host);
}

function addStoreHint(items,href,text=''){
  if(!href||hasTemplateGarbage(href))return;
  let u;try{u=new URL(href)}catch{return}
  const host=u.hostname.toLowerCase();
  if(!isStoreHost(host))return;
  const cleanText=cleanCandidate(text);
  if(cleanText&&!/^(store page|steam|store|official|公式|購入|販売ページ)$/i.test(cleanText)){
    items.push({name:cleanText,source:'store-link-text',url:href,confidence:98});
  }
  if(host==='store.steampowered.com'){
    const seg=u.pathname.split('/').filter(Boolean);
    const appIndex=seg.findIndex(x=>x==='app');
    const slug=appIndex>=0?seg[appIndex+2]||'':'';
    if(slug)items.push({name:decodeURIComponent(slug).replace(/_/g,' '),source:'steam-slug',url:href,confidence:96});
  }else if(host.endsWith('itch.io')){
    const slug=host.split('.')[0];
    if(slug&&slug!=='www')items.push({name:slug.replace(/-/g,' '),source:'itch-slug',url:href,confidence:96});
  }
}

function extractScriptGameHints(html,items){
  const raw=String(html).replace(/\\\//g,'/').replace(/&quot;/gi,'"').replace(/&#39;/gi,"'");
  for(const m of raw.matchAll(/https?:\/\/store\.steampowered\.com\/app\/\d+\/[^\s"'<>\\)]+/gi)){
    addStoreHint(items,m[0],'');
  }
  for(const m of raw.matchAll(/(?:title|name)\s*:\s*(["'`])([^"'`]{2,120})\1[\s\S]{0,500}?(?:steam|storeUrl|store_url)\s*:\s*(["'`])(https?:\/\/[^"'`]+)\3/gi)){
    const href=m[4];
    let host='';try{host=new URL(href).hostname}catch{}
    if(isStoreHost(host))items.push({name:m[2],source:'script-game-title',url:href,confidence:98});
    addStoreHint(items,href,m[2]);
  }
}

function extractNameHints(html,baseUrl,pageTitle){
  const items=[];
  addTitleHints(items,pageTitle);
  addPageSlugHint(items,baseUrl);
  const articleMatch=String(html).match(/<article[^>]*>([\s\S]*?)<\/article>/i);
  const scope=articleMatch?.[1]||html;
  for(const m of scope.matchAll(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi)){
    const name=cleanCandidate(m[2]);
    if(name)items.push({name,source:`heading-h${m[1]}`,url:'',confidence:78});
  }
  for(const m of scope.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)){
    const rawHref=decodeEntities(m[1]);
    if(hasTemplateGarbage(rawHref))continue;
    const href=absoluteUrl(rawHref,baseUrl);
    addStoreHint(items,href,m[2]);
  }
  extractScriptGameHints(html,items);
  return uniqueHints(items);
}

function extractImages(html,baseUrl){
  const result=[];
  const seen=new Set();
  const featuredRaw=String(html).match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)?.[1]||'';
  const featured=!hasTemplateGarbage(featuredRaw)?absoluteUrl(decodeEntities(featuredRaw),baseUrl):'';
  if(featured){seen.add(featured);result.push({url:featured,alt:'',featured:true})}

  const article=String(html).match(/<article[^>]*>([\s\S]*?)<\/article>/i)?.[1]||html;
  for(const m of article.matchAll(/<img\b[^>]*>/gi)){
    const tag=m[0];
    if(hasTemplateGarbage(tag))continue;
    const raw=attr(tag,'data-src')||attr(tag,'data-lazy-src')||attr(tag,'src');
    if(!raw||hasTemplateGarbage(raw))continue;
    const url=absoluteUrl(raw,baseUrl);
    if(!url||seen.has(url)||/^data:/i.test(url)||/%24%7B/i.test(url))continue;
    const alt=attr(tag,'alt');
    if(hasTemplateGarbage(alt))continue;
    seen.add(url);
    result.push({url,alt,featured:false});
    if(result.length>=100)break;
  }
  return result;
}

export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='GET')return res.status(405).json({ok:false,error:'method_not_allowed'});
  try{
    const raw=String(req.query?.url||'').trim();
    if(!raw)return res.status(400).json({ok:false,error:'url_required'});
    const url=new URL(raw);
    if(!/(^|\.)harf-way\.com$/i.test(url.hostname))return res.status(400).json({ok:false,error:'harf_way_url_only'});

    const response=await fetch(url.toString(),{
      headers:{'user-agent':'HARF-WAY Archive Salvager/0.8'},
      redirect:'follow'
    });
    if(!response.ok)return res.status(502).json({ok:false,error:`source_${response.status}`});

    const html=await response.text();
    const finalUrl=response.url||url.toString();
    const title=pickPlain(html,[
      /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i,
      /<title[^>]*>([\s\S]*?)<\/title>/i
    ]);
    const date=pickPlain(html,[
      /<meta[^>]+property=["']article:published_time["'][^>]+content=["']([^"']+)["']/i,
      /<time[^>]+datetime=["']([^"']+)["']/i
    ]);
    const body=extractReadableText(html);
    const images=extractImages(html,finalUrl);
    const featuredImage=images.find(x=>x.featured)?.url||'';
    const nameHints=extractNameHints(html,finalUrl,title);
    const storeLinks=nameHints.filter(x=>x.url).map(x=>({
      name:x.name,url:x.url,source:x.source,sources:x.sources,confidence:x.confidence
    }));

    return res.status(200).json({
      ok:true,
      article:{
        url:finalUrl,
        title,
        date,
        text:body.slice(0,150000),
        featuredImage,
        images,
        nameHints,
        storeLinks,
        extractionMode:'readable-text-blocks'
      }
    });
  }catch(error){
    console.error('[archive-fetch]',error);
    return res.status(500).json({ok:false,error:'archive_fetch_failed'});
  }
}
