import { absoluteUrl, escapeXml, isoDate, listPublicNotes, listPublicWords, publicDatabaseContext } from '../lib/game-public-seo.js';

function urlNode(req,path,lastmod=''){
  return `<url><loc>${escapeXml(absoluteUrl(req,path))}</loc>${lastmod?`<lastmod>${escapeXml(lastmod)}</lastmod>`:''}</url>`;
}
export default async function handler(req,res){
  if(req.method!=='GET')return res.status(405).end('Method Not Allowed');
  try{
    const {sql}=await publicDatabaseContext();
    const [notes,words]=await Promise.all([listPublicNotes(sql),listPublicWords(sql)]);
    const nodes=[
      urlNode(req,'/'),
      urlNode(req,'/archive/'),
      urlNode(req,'/sales'),
      urlNode(req,'/mew-log/'),
      urlNode(req,'/notes/'),
      urlNode(req,'/words/')
    ];
    for(const note of notes)nodes.push(urlNode(req,note.url,isoDate(note.snapshotUpdatedAt||note.publishedAt)));
    for(const word of words)nodes.push(urlNode(req,word.url,isoDate(word.snapshotUpdatedAt||word.publishedAt)));
    const xml=`<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${nodes.join('')}</urlset>`;
    res.setHeader('Content-Type','application/xml; charset=utf-8');
    res.setHeader('Cache-Control','public, max-age=0, s-maxage=30, must-revalidate');
    if(process.env.VERCEL_ENV!=='production')res.setHeader('X-Robots-Tag','noindex');
    return res.status(200).end(xml);
  }catch(error){
    console.error('[public-seo-sitemap]',error?.message||error);
    res.setHeader('Content-Type','application/xml; charset=utf-8');res.setHeader('Cache-Control','no-store');
    return res.status(503).end('<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9"></urlset>');
  }
}