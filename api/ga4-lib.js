import {createSign} from 'node:crypto';

const SCOPE='https://www.googleapis.com/auth/analytics.readonly';
const TOKEN_URL='https://oauth2.googleapis.com/token';
const DATA_API='https://analyticsdata.googleapis.com/v1beta';

const HOST_SERVICE=new Map([
  ['harfway-playback.vercel.app','ways'],
  ['harfway-playback-harf-way.vercel.app','ways'],
  ['harfway-showcase-ui-v4.vercel.app','showcase'],
  ['harfway-showcase-ui-v4-harf-way.vercel.app','showcase'],
  ['harfway-playlist-tv.vercel.app','playlist'],
  ['harfway-playlist-tv-harf-way.vercel.app','playlist'],
  ['weekly-yorimichi-editor.vercel.app','yorimichi'],
  ['weekly-yorimichi-editor-harf-way.vercel.app','yorimichi'],
  ['harfway-zine-editor.vercel.app','zine'],
  ['harfway-zine-editor-harf-way.vercel.app','zine']
]);

const empty=()=>({pageViews:0,sessions:0,activeUsers:0,eventCount:0,events:{}});
const number=v=>Number(v||0);
const b64=obj=>Buffer.from(JSON.stringify(obj)).toString('base64url');

function credentials(){
  const propertyId=String(process.env.GA4_PROPERTY_ID||'').trim().replace(/^properties\//,'');
  let email=String(process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL||'').trim();
  let privateKey=String(process.env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY||'').replace(/\\n/g,'\n').trim();
  const raw=String(process.env.GOOGLE_SERVICE_ACCOUNT_JSON||'').trim();
  if(raw){
    try{
      const parsed=JSON.parse(raw);
      email=String(parsed.client_email||email).trim();
      privateKey=String(parsed.private_key||privateKey).replace(/\\n/g,'\n').trim();
    }catch{}
  }
  return {propertyId,email,privateKey,configured:Boolean(propertyId&&email&&privateKey)};
}

async function accessToken(email,privateKey){
  const now=Math.floor(Date.now()/1000);
  const unsigned=`${b64({alg:'RS256',typ:'JWT'})}.${b64({iss:email,scope:SCOPE,aud:TOKEN_URL,iat:now,exp:now+3600})}`;
  const signer=createSign('RSA-SHA256');
  signer.update(unsigned);
  signer.end();
  const assertion=`${unsigned}.${signer.sign(privateKey).toString('base64url')}`;
  const body=new URLSearchParams({grant_type:'urn:ietf:params:oauth:grant-type:jwt-bearer',assertion});
  const response=await fetch(TOKEN_URL,{method:'POST',headers:{'content-type':'application/x-www-form-urlencoded'},body,cache:'no-store'});
  const data=await response.json().catch(()=>({}));
  if(!response.ok||!data.access_token)throw new Error(data.error_description||data.error||`oauth_${response.status}`);
  return data.access_token;
}

async function runReport(propertyId,token,body){
  const response=await fetch(`${DATA_API}/properties/${encodeURIComponent(propertyId)}:runReport`,{
    method:'POST',
    headers:{authorization:`Bearer ${token}`,'content-type':'application/json'},
    body:JSON.stringify(body),
    cache:'no-store'
  });
  const data=await response.json().catch(()=>({}));
  if(!response.ok){
    const message=data?.error?.message||data?.error||`ga4_${response.status}`;
    const error=new Error(message);
    error.status=response.status;
    throw error;
  }
  return data;
}

export function ga4ConfigStatus(){
  const c=credentials();
  return {configured:c.configured,propertyIdConfigured:Boolean(c.propertyId),credentialsConfigured:Boolean(c.email&&c.privateKey)};
}

export async function getGa4Summary(days=7){
  const c=credentials();
  if(!c.configured)return {ok:false,reason:'ga4_data_api_credentials_required',config:ga4ConfigStatus(),services:{}};
  try{
    const token=await accessToken(c.email,c.privateKey);
    const dateRanges=[{startDate:`${Math.max(1,Math.min(365,Number(days)||7))}daysAgo`,endDate:'today'}];
    const [traffic,eventReport]=await Promise.all([
      runReport(c.propertyId,token,{dateRanges,dimensions:[{name:'hostName'}],metrics:[{name:'screenPageViews'},{name:'sessions'},{name:'activeUsers'}],limit:100}),
      runReport(c.propertyId,token,{dateRanges,dimensions:[{name:'hostName'},{name:'eventName'}],metrics:[{name:'eventCount'}],limit:10000})
    ]);
    const services={ways:empty(),showcase:empty(),playlist:empty(),yorimichi:empty(),zine:empty()};
    for(const row of traffic.rows||[]){
      const host=String(row.dimensionValues?.[0]?.value||'').toLowerCase();
      const service=HOST_SERVICE.get(host);
      if(!service)continue;
      const s=services[service];
      s.pageViews+=number(row.metricValues?.[0]?.value);
      s.sessions+=number(row.metricValues?.[1]?.value);
      s.activeUsers+=number(row.metricValues?.[2]?.value);
    }
    for(const row of eventReport.rows||[]){
      const host=String(row.dimensionValues?.[0]?.value||'').toLowerCase();
      const eventName=String(row.dimensionValues?.[1]?.value||'');
      const service=HOST_SERVICE.get(host);
      if(!service||!eventName)continue;
      const count=number(row.metricValues?.[0]?.value);
      services[service].eventCount+=count;
      services[service].events[eventName]=(services[service].events[eventName]||0)+count;
    }
    return {ok:true,reason:null,config:ga4ConfigStatus(),period:`last_${Math.max(1,Math.min(365,Number(days)||7))}_days`,services};
  }catch(error){
    return {ok:false,reason:'ga4_data_api_error',message:error?.message||'ga4_data_api_error',status:error?.status||0,config:ga4ConfigStatus(),services:{}};
  }
}
