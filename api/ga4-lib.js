// Preview redeploy marker: OIDC environment configured.
import {getVercelOidcToken} from '@vercel/oidc';
import {ExternalAccountClient} from 'google-auth-library';

const SCOPE='https://www.googleapis.com/auth/analytics.readonly';
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

function credentials(){
  const propertyId=String(process.env.GA4_PROPERTY_ID||'').trim().replace(/^properties\//,'');
  const projectNumber=String(process.env.GCP_PROJECT_NUMBER||'').trim();
  const poolId=String(process.env.GCP_WORKLOAD_IDENTITY_POOL_ID||'').trim();
  const providerId=String(process.env.GCP_WORKLOAD_IDENTITY_POOL_PROVIDER_ID||'').trim();
  const serviceAccountEmail=String(process.env.GCP_SERVICE_ACCOUNT_EMAIL||'').trim();
  const configured=Boolean(propertyId&&projectNumber&&poolId&&providerId&&serviceAccountEmail);
  return {propertyId,projectNumber,poolId,providerId,serviceAccountEmail,configured};
}

function audience(c){
  return `https://iam.googleapis.com/projects/${c.projectNumber}/locations/global/workloadIdentityPools/${c.poolId}/providers/${c.providerId}`;
}

async function accessToken(c){
  const gcpAudience=audience(c);
  const authClient=ExternalAccountClient.fromJSON({
    type:'external_account',
    audience:gcpAudience,
    subject_token_type:'urn:ietf:params:oauth:token-type:jwt',
    token_url:'https://sts.googleapis.com/v1/token',
    service_account_impersonation_url:`https://iamcredentials.googleapis.com/v1/projects/-/serviceAccounts/${encodeURIComponent(c.serviceAccountEmail)}:generateAccessToken`,
    scopes:[SCOPE],
    subject_token_supplier:{
      getSubjectToken:()=>getVercelOidcToken({audience:gcpAudience})
    }
  });
  if(!authClient)throw new Error('gcp_external_account_client_unavailable');
  const access=await authClient.getAccessToken();
  const token=typeof access==='string'?access:access?.token;
  if(!token)throw new Error('gcp_oidc_access_token_missing');
  return token;
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
  return {
    configured:c.configured,
    authMode:'vercel_oidc',
    propertyIdConfigured:Boolean(c.propertyId),
    projectNumberConfigured:Boolean(c.projectNumber),
    workloadIdentityConfigured:Boolean(c.poolId&&c.providerId),
    serviceAccountConfigured:Boolean(c.serviceAccountEmail)
  };
}

export async function getGa4Summary(days=7){
  const c=credentials();
  if(!c.configured)return {ok:false,reason:'ga4_data_api_oidc_config_required',config:ga4ConfigStatus(),services:{}};
  try{
    const token=await accessToken(c);
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
