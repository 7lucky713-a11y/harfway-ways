function clean(v,max=500){return String(v||'').trim().slice(0,max)}
function decodeEntities(v=''){return String(v).replace(/&amp;/gi,'&').replace(/&quot;/gi,'"').replace(/&#39;/gi,"'").replace(/&lt;/gi,'<').replace(/&gt;/gi,'>').replace(/&#(\d+);/g,(_,n)=>String.fromCodePoint(Number(n)||32))}
function strip(v=''){return decodeEntities(String(v).replace(/<[^>]+>/g,' ').replace(/\s+/g,' ').trim())}
function normalize(v=''){return String(v||'').normalize('NFKC').toLowerCase().replace(/[\s:：・!！?？'"“”‘’()（）\[\]【】_\-–—～~]+/g,'')}
function similarity(a='',b=''){
  const x=normalize(a),y=normalize(b);if(!x||!y)return 0;if(x===y)return 100;
  if(x.length>=3&&(x.includes(y)||y.includes(x)))return Math.min(x.length,y.length)>=5?94:86;
  const ta=String(a).toLowerCase().split(/[\s:：・_\-–—～~]+/).filter(x=>x.length>1),tb=String(b).toLowerCase();
  if(!ta.length)return 0;return Math.round(ta.filter(t=>tb.includes(t)).length/ta.length*80);
}
function queryVariants(query=''){
  const q=clean(query,300),out=[q];
  const quoted=[...q.matchAll(/[『「【《]([^』」】》]{2,120})[』」】》]/g)].map(m=>m[1].trim()).filter(Boolean);
  out.push(...quoted);
  for(const sep of [/\s+[―—–-]\s+/,/\s*[～~]\s*/]){const head=q.split(sep)[0]?.trim();if(head&&head.length>=2)out.push(head)}
  const ascii=q.replace(/[『』「」【】《》]/g,' ').replace(/[―—–～~]/g,' ').replace(/\s+/g,' ').trim();if(ascii)out.push(ascii);
  return [...new Set(out.filter(Boolean))].slice(0,6);
}
function steamResultFromTag(tag,query){
  const href=tag.match(/href=["']([^"']+)["']/i)?.[1]||'';
  const appId=(tag.match(/data-ds-appid=["'](\d+)["']/i)?.[1]||href.match(/\/app\/(\d+)/)?.[1]||'');
  if(!appId)return null;
  const title=strip(tag.match(/<span[^>]*class=["'][^"']*title[^"']*["'][^>]*>([\s\S]*?)<\/span>/i)?.[1]||tag.match(/<div[^>]*class=["'][^"']*match_name[^"']*["'][^>]*>([\s\S]*?)<\/div>/i)?.[1]||tag.match(/<span[^>]*>([^<]{2,180})<\/span>/i)?.[1]||'');
  if(!title)return null;
  return {provider:'steam',appId,title,url:`https://store.steampowered.com/app/${appId}/`,score:similarity(query,title)};
}
async function steamSuggestOnce(query,originalQuery){
  const urls=[
    `https://store.steampowered.com/search/suggest?term=${encodeURIComponent(query)}&f=games&cc=JP&l=japanese&realm=1`,
    `https://store.steampowered.com/search/?term=${encodeURIComponent(query)}&category1=998&l=japanese`
  ];
  const out=[],seen=new Set();
  for(const url of urls){
    try{
      const r=await fetch(url,{headers:{'user-agent':'Mozilla/5.0 HARF-WAY Archive Salvager/1.0','accept-language':'ja,en;q=0.8'},redirect:'follow'});
      if(!r.ok)continue;const html=await r.text();
      const tags=[...html.matchAll(/<a\b[^>]*(?:match|search_result_row)[^>]*>[\s\S]*?<\/a>/gi)].map(m=>m[0]);
      for(const tag of tags){const item=steamResultFromTag(tag,originalQuery);if(!item||seen.has(item.appId))continue;seen.add(item.appId);out.push({...item,matchedQuery:query})}
      if(!out.length){
        for(const m of html.matchAll(/href=["']https?:\/\/store\.steampowered\.com\/app\/(\d+)\/[^"']*["'][^>]*>[\s\S]{0,1000}?(?:match_name|title)[^>]*>([\s\S]*?)<\//gi)){
          const appId=m[1],title=strip(m[2]);if(!title||seen.has(appId))continue;seen.add(appId);out.push({provider:'steam',appId,title,url:`https://store.steampowered.com/app/${appId}/`,score:similarity(originalQuery,title),matchedQuery:query})
        }
      }
      if(out.length)break;
    }catch{}
  }
  return out;
}
async function steamSuggest(query){
  const all=new Map();
  for(const variant of queryVariants(query)){
    const rows=await steamSuggestOnce(variant,query);
    for(const row of rows){const prev=all.get(row.appId);if(!prev||row.score>prev.score)all.set(row.appId,row)}
    if([...all.values()].some(x=>x.score>=94))break;
  }
  return [...all.values()].sort((a,b)=>b.score-a.score||a.title.localeCompare(b.title)).slice(0,8);
}
export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');res.setHeader('Access-Control-Allow-Origin','*');
  if(req.method!=='GET')return res.status(405).json({ok:false,error:'method_not_allowed'});
  const q=clean(req.query?.q,300),provider=clean(req.query?.provider||'steam',50).toLowerCase();
  if(!q)return res.status(400).json({ok:false,error:'query_required'});
  if(provider!=='steam')return res.status(400).json({ok:false,error:'provider_not_supported'});
  try{
    const candidates=await steamSuggest(q);
    return res.status(200).json({ok:true,provider,query:q,variants:queryVariants(q),count:candidates.length,candidates});
  }catch(error){console.error('[archive-store-search]',error);return res.status(500).json({ok:false,error:'store_search_failed'})}
}
