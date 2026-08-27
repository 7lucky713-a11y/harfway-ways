function decodeEntities(value=''){
  return String(value)
    .replace(/&nbsp;/gi,' ')
    .replace(/&amp;/gi,'&')
    .replace(/&quot;/gi,'"')
    .replace(/&#39;/gi,"'")
    .replace(/&lt;/gi,'<')
    .replace(/&gt;/gi,'>');
}
function stripHtml(html=''){
  return decodeEntities(String(html)
    .replace(/<script[\s\S]*?<\/script>/gi,' ')
    .replace(/<style[\s\S]*?<\/style>/gi,' ')
    .replace(/<noscript[\s\S]*?<\/noscript>/gi,' ')
    .replace(/<br\s*\/?\s*>/gi,'\n')
    .replace(/<\/(p|h[1-6]|div|section|article)>/gi,'\n\n')
    .replace(/<\/li>/gi,'\n')
    .replace(/<[^>]+>/g,' ')
    .replace(/[\t\r ]+/g,' ')
    .replace(/\n\s+/g,'\n')
    .replace(/\n{3,}/g,'\n\n')
    .trim());
}
function pick(html, patterns){
  for(const re of patterns){const m=String(html).match(re);if(m?.[1])return stripHtml(m[1]);}
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
  return stripHtml(value)
    .replace(/\s*[|｜]\s*HARF[- ]?WAY.*$/i,'')
    .replace(/\s*[–—-]\s*(Steam|itch\.io|BOOTH|DLsite|Nintendo.*|PlayStation.*|Xbox.*)$/i,'')
    .replace(/^(Steam|itch\.io|BOOTH|DLsite)[:：\s-]*/i,'')
    .replace(/\s+/g,' ')
    .trim();
}
function uniqueHints(items){
  const seen=new Set();
  return items.filter(item=>{
    const name=cleanCandidate(item.name||'');
    if(!name||name.length<2||name.length>120)return false;
    const key=name.normalize('NFKC').toLowerCase();
    if(seen.has(key))return false;
    seen.add(key);item.name=name;return true;
  }).slice(0,120);
}
function extractNameHints(html,baseUrl){
  const items=[];
  const articleMatch=String(html).match(/<article[^>]*>([\s\S]*?)<\/article>/i);
  const scope=articleMatch?.[1]||html;
  for(const m of scope.matchAll(/<h([1-6])[^>]*>([\s\S]*?)<\/h\1>/gi)){
    const name=cleanCandidate(m[2]);
    if(name)items.push({name,source:`heading-h${m[1]}`,url:''});
  }
  for(const m of scope.matchAll(/<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi)){
    const href=absoluteUrl(decodeEntities(m[1]),baseUrl);
    const text=cleanCandidate(m[2]);
    if(!href)continue;
    const host=(()=>{try{return new URL(href).hostname.toLowerCase()}catch{return ''}})();
    const isStore=/store\.steampowered\.com|itch\.io|booth\.pm|dlsite\.com|nintendo\.|playstation\.|xbox\./i.test(host);
    if(text&&isStore)items.push({name:text,source:'store-link-text',url:href});
    if(isStore){
      try{
        const u=new URL(href);
        if(host==='store.steampowered.com'){
          const seg=u.pathname.split('/').filter(Boolean);
          const appIndex=seg.findIndex(x=>x==='app');
          const slug=appIndex>=0?seg[appIndex+2]||'':'';
          if(slug)items.push({name:slug.replace(/_/g,' '),source:'steam-slug',url:href});
        } else if(host.endsWith('itch.io')) {
          const slug=host.split('.')[0];
          if(slug&&slug!=='www')items.push({name:slug.replace(/-/g,' '),source:'itch-slug',url:href});
        }
      }catch{}
    }
  }
  return uniqueHints(items);
}
function extractImages(html,baseUrl){
  const result=[];const seen=new Set();
  const featuredRaw=String(html).match(/<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)["']/i)?.[1]||'';
  const featured=absoluteUrl(decodeEntities(featuredRaw),baseUrl);
  if(featured){seen.add(featured);result.push({url:featured,alt:'',featured:true})}
  const article=String(html).match(/<article[^>]*>([\s\S]*?)<\/article>/i)?.[1]||html;
  for(const m of article.matchAll(/<img\b[^>]*>/gi)){
    const tag=m[0];
    const raw=attr(tag,'data-src')||attr(tag,'data-lazy-src')||attr(tag,'src');
    const url=absoluteUrl(raw,baseUrl);
    if(!url||seen.has(url)||/^data:/i.test(url))continue;
    seen.add(url);result.push({url,alt:attr(tag,'alt'),featured:false});
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
    const response=await fetch(url.toString(),{headers:{'user-agent':'HARF-WAY Archive Salvager/0.4'},redirect:'follow'});
    if(!response.ok)return res.status(502).json({ok:false,error:`source_${response.status}`});
    const html=await response.text();
    const finalUrl=response.url||url.toString();
    const title=pick(html,[/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i,/<title[^>]*>([\s\S]*?)<\/title>/i]);
    const date=pick(html,[/<meta[^>]+property=["']article:published_time["'][^>]+content=["']([^"']+)["']/i,/<time[^>]+datetime=["']([^"']+)["']/i]);
    const body=pick(html,[/<article[^>]*>([\s\S]*?)<\/article>/i,/<main[^>]*>([\s\S]*?)<\/main>/i])||stripHtml(html);
    const images=extractImages(html,finalUrl);
    const featuredImage=images.find(x=>x.featured)?.url||'';
    const nameHints=extractNameHints(html,finalUrl);
    return res.status(200).json({ok:true,article:{url:finalUrl,title,date,text:body.slice(0,150000),featuredImage,images,nameHints}});
  }catch(error){
    console.error('[archive-fetch]',error);
    return res.status(500).json({ok:false,error:'archive_fetch_failed'});
  }
}