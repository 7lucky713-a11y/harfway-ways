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
function rawPick(html, patterns){
  for(const re of patterns){const m=String(html).match(re);if(m?.[1])return decodeEntities(m[1].trim());}
  return '';
}
function absoluteUrl(value, base){
  try{return new URL(decodeEntities(value),base).toString()}catch{return ''}
}
function extractImages(html, base, featuredImage){
  const seen=new Set();const images=[];
  const push=(url,alt='',featured=false)=>{const abs=absoluteUrl(url,base);if(!abs||seen.has(abs))return;if(!/^https?:/i.test(abs))return;seen.add(abs);images.push({url:abs,alt:stripHtml(alt),featured:Boolean(featured)})};
  if(featuredImage)push(featuredImage,'',true);
  const articleHtml=String(html).match(/<article[^>]*>([\s\S]*?)<\/article>/i)?.[1]||String(html).match(/<main[^>]*>([\s\S]*?)<\/main>/i)?.[1]||html;
  for(const m of String(articleHtml).matchAll(/<img\b[^>]*>/gi)){
    const tag=m[0];
    const src=rawPick(tag,[/\bsrc=["']([^"']+)["']/i,/\bdata-src=["']([^"']+)["']/i,/\bdata-lazy-src=["']([^"']+)["']/i]);
    const srcset=rawPick(tag,[/\bsrcset=["']([^"']+)["']/i,/\bdata-srcset=["']([^"']+)["']/i]);
    const alt=rawPick(tag,[/\balt=["']([^"']*)["']/i]);
    if(src)push(src,alt,false);else if(srcset){const first=srcset.split(',')[0]?.trim().split(/\s+/)[0];if(first)push(first,alt,false)}
    if(images.length>=100)break;
  }
  return images.slice(0,100);
}
export default async function handler(req,res){
  res.setHeader('Cache-Control','no-store');
  if(req.method!=='GET')return res.status(405).json({ok:false,error:'method_not_allowed'});
  try{
    const raw=String(req.query?.url||'').trim();
    if(!raw)return res.status(400).json({ok:false,error:'url_required'});
    const url=new URL(raw);
    if(!/(^|\.)harf-way\.com$/i.test(url.hostname))return res.status(400).json({ok:false,error:'harf_way_url_only'});
    const response=await fetch(url.toString(),{headers:{'user-agent':'HARF-WAY Archive Salvager/0.3'},redirect:'follow'});
    if(!response.ok)return res.status(502).json({ok:false,error:`source_${response.status}`});
    const html=await response.text();
    const finalUrl=response.url||url.toString();
    const title=pick(html,[/<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)["']/i,/<title[^>]*>([\s\S]*?)<\/title>/i]);
    const date=rawPick(html,[/<meta[^>]+property=["']article:published_time["'][^>]+content=["']([^"']+)["']/i,/<time[^>]+datetime=["']([^"']+)["']/i]);
    const excerpt=rawPick(html,[/<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)["']/i,/<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)["']/i]);
    const featuredImage=absoluteUrl(rawPick(html,[/<meta[^>]+property=["']og:image(?::secure_url)?["'][^>]+content=["']([^"']+)["']/i]),finalUrl);
    const body=pick(html,[/<article[^>]*>([\s\S]*?)<\/article>/i,/<main[^>]*>([\s\S]*?)<\/main>/i])||stripHtml(html);
    const images=extractImages(html,finalUrl,featuredImage);
    return res.status(200).json({ok:true,article:{url:finalUrl,title,date,excerpt:stripHtml(excerpt),text:body.slice(0,150000),featuredImage,images}});
  }catch(error){
    console.error('[archive-fetch]',error);
    return res.status(500).json({ok:false,error:'archive_fetch_failed'});
  }
}