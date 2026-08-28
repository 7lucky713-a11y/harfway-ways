import { createHash } from 'node:crypto';

export const GAME_LINK_SERVICES = [
  'steam','nintendo','playstation','xbox','itch','dlsite','booth','google_play','app_store',
  'epic','gog','gamejolt','unityroom','novelgame','freem','official','web'
];

export const GAME_LINK_LABELS = {
  steam:'Steam',nintendo:'Nintendo eShop',playstation:'PlayStation',xbox:'Xbox',itch:'itch.io',
  dlsite:'DLsite',booth:'BOOTH',google_play:'Google Play',app_store:'App Store',epic:'Epic Games Store',
  gog:'GOG',gamejolt:'Game Jolt',unityroom:'unityroom',novelgame:'ノベルゲームコレクション',
  freem:'ふりーむ！',official:'公式サイト',web:'その他'
};

const PRIORITY = ['steam','nintendo','playstation','xbox','itch','dlsite','booth','google_play','app_store','epic','gog','gamejolt','unityroom','novelgame','freem','official','web'];

function hash(value=''){return createHash('sha256').update(String(value)).digest('hex').slice(0,32)}
function hostMatches(host,pattern){return host===pattern||host.endsWith(`.${pattern}`)}

export function canonicalGameUrl(value=''){
  try{
    const u=new URL(String(value).trim());
    u.hash='';
    for(const key of [...u.searchParams.keys()]){
      if(/^utm_/i.test(key)||['ref','ref_','source','campaign','l','lang','locale'].includes(key.toLowerCase()))u.searchParams.delete(key);
    }
    const path=u.pathname.replace(/\/{2,}/g,'/').replace(/\/$/,'')||'/';
    const query=u.searchParams.toString();
    return `${u.protocol}//${u.hostname.toLowerCase()}${u.port?`:${u.port}`:''}${path}${query?`?${query}`:''}`;
  }catch{return String(value||'').trim()}
}

export function classifyGameLink(value='',serviceHint=''){
  const raw=String(value||'').trim();
  if(!raw)return null;
  let u;try{u=new URL(raw)}catch{return null}
  if(!/^https?:$/.test(u.protocol))return null;
  const host=u.hostname.toLowerCase();
  const hint=GAME_LINK_SERVICES.includes(String(serviceHint))?String(serviceHint):'';
  let service=hint;
  if(!service){
    if(host==='store.steampowered.com')service='steam';
    else if(/nintendo\./.test(host)||hostMatches(host,'nintendo.com'))service='nintendo';
    else if(hostMatches(host,'playstation.com'))service='playstation';
    else if(hostMatches(host,'xbox.com')||hostMatches(host,'microsoft.com'))service='xbox';
    else if(host.endsWith('.itch.io')||host==='itch.io')service='itch';
    else if(hostMatches(host,'dlsite.com'))service='dlsite';
    else if(hostMatches(host,'booth.pm'))service='booth';
    else if(host==='play.google.com')service='google_play';
    else if(host==='apps.apple.com')service='app_store';
    else if(hostMatches(host,'epicgames.com'))service='epic';
    else if(hostMatches(host,'gog.com'))service='gog';
    else if(hostMatches(host,'gamejolt.com'))service='gamejolt';
    else if(hostMatches(host,'unityroom.com'))service='unityroom';
    else if(hostMatches(host,'novelgame.jp'))service='novelgame';
    else if(hostMatches(host,'freem.ne.jp'))service='freem';
    else service='web';
  }
  const canonical=canonicalGameUrl(raw);
  let externalId='';
  if(service==='steam')externalId=u.pathname.match(/\/app\/(\d+)/)?.[1]||'';
  else if(service==='google_play')externalId=u.searchParams.get('id')||'';
  else if(service==='app_store')externalId=u.pathname.match(/\/id(\d+)/)?.[1]||'';
  else if(service==='dlsite')externalId=u.pathname.match(/product_id\/([^/.]+)/i)?.[1]||'';
  else if(service==='booth')externalId=u.pathname.match(/\/items\/(\d+)/)?.[1]||'';
  else if(service==='unityroom')externalId=u.pathname.split('/').filter(Boolean).at(-1)||'';
  else if(service==='novelgame')externalId=u.pathname.split('/').filter(Boolean).at(-1)||'';
  else if(service==='freem')externalId=u.pathname.match(/win\/game\/(\d+)/)?.[1]||'';
  if(!externalId)externalId=hash(canonical.toLowerCase());
  return {service,label:GAME_LINK_LABELS[service]||service,url:canonical,externalId};
}

export function normalizeGameLinks(items=[]){
  const result=[],seen=new Set();
  for(const raw of Array.isArray(items)?items:[]){
    const item=typeof raw==='string'?{url:raw}:raw||{};
    const requestedService=String(item.service||'').trim();
    // game_refs also stores WAYS / Playlist / Yorimichi relationships. Never
    // reinterpret those unrelated refs as generic web/store links.
    if(requestedService&&!GAME_LINK_SERVICES.includes(requestedService))continue;
    let classified=classifyGameLink(item.url,requestedService);
    if(!classified)continue;
    if(requestedService==='official'&&classified.service==='official')classified={...classified,label:GAME_LINK_LABELS.official};
    const key=`${classified.service}:${classified.externalId}`;
    if(seen.has(key))continue;
    seen.add(key);
    result.push({...classified,name:String(item.name||'').trim().slice(0,300),primary:!!item.primary,source:String(item.source||'').trim().slice(0,100)});
    if(result.length>=30)break;
  }
  return result;
}

export function choosePrimaryLink(items=[]){
  const links=normalizeGameLinks(items);
  const explicit=links.find(x=>x.primary);
  if(explicit)return explicit;
  return links.sort((a,b)=>PRIORITY.indexOf(a.service)-PRIORITY.indexOf(b.service))[0]||null;
}

export function isKnownGamePlatformUrl(value=''){
  const link=classifyGameLink(value);
  return !!link&&link.service!=='web';
}
