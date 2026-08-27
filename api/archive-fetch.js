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
export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='GET')return res.status(405).json({ok:false,error:'method_not_allowed'});
  try{
    const raw=String(req.query?.url||'').trim();
    if(!raw)return res.status(400).json({ok:false,error:'url_required'});
    const url=new URL(raw);
    if(!/(^|\.)harf-way\.com$/i.test(url.hostname))return res.status(400).json({ok:false,error:'harf_way_url_only'});
    const response=await fetch(url.toString(),{headers:{'user-agent':'HARF-WAY Archive Salvager/0.2'},redirect:'follow'});
    if(!response.ok)return res.status(502).json({ok:false,error:`source_${response.status}`});
    const html=await response.text();
    const title=pick(html,[/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i,/<title[^>]*>([\s\S]*?)<\/title>/i]);
    const date=pick(html,[/<meta[^>]+property=["']article:published_time["'][^>]+content=["']([^"']+)["']/i,/<time[^>]+datetime=["']([^"']+)["']/i]);
    const body=pick(html,[/<article[^>]*>([\s\S]*?)<\/article>/i,/<main[^>]*>([\s\S]*?)<\/main>/i])||stripHtml(html);
    return res.status(200).json({ok:true,article:{url:response.url||url.toString(),title,date,text:body.slice(0,150000)}});
  }catch(error){
    console.error('[archive-fetch]',error);
    return res.status(500).json({ok:false,error:'archive_fetch_failed'});
  }
}